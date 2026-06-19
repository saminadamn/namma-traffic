"""
Authority ML prediction service using CatBoost models.
Models trained by and provided by the authority — used as-is for scoring.
"""
import json
import os
from datetime import datetime, timezone

import pandas as pd

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ml_models")

# ── Lazy-loaded globals ────────────────────────────────────────────────────────
_closure_model = None
_priority_model = None
_closure_threshold: float = 0.8
_priority_threshold: float = 0.25
_incident_count_map: dict = {}
_closure_rate_map: dict = {}
_priority_rate_map: dict = {}
_global_closure_rate: float = 0.083
_global_priority_rate: float = 0.616
_loaded = False


def _load():
    global _closure_model, _priority_model
    global _closure_threshold, _priority_threshold
    global _incident_count_map, _closure_rate_map, _priority_rate_map
    global _global_closure_rate, _global_priority_rate, _loaded

    if _loaded:
        return

    try:
        from catboost import CatBoostClassifier

        _closure_model = CatBoostClassifier()
        _closure_model.load_model(os.path.join(MODELS_DIR, "closure_model.cbm"))

        _priority_model = CatBoostClassifier()
        _priority_model.load_model(os.path.join(MODELS_DIR, "priority_model.cbm"))

        with open(os.path.join(MODELS_DIR, "closure_threshold.json")) as f:
            _closure_threshold = json.load(f)["threshold"]

        with open(os.path.join(MODELS_DIR, "priority_threshold.json")) as f:
            _priority_threshold = json.load(f)["threshold"]

        with open(os.path.join(MODELS_DIR, "incident_count_map.json")) as f:
            _incident_count_map = json.load(f)

        with open(os.path.join(MODELS_DIR, "closure_rate_map.json")) as f:
            _closure_rate_map = json.load(f)

        with open(os.path.join(MODELS_DIR, "priority_rate_map.json")) as f:
            _priority_rate_map = json.load(f)

        with open(os.path.join(MODELS_DIR, "spatial_defaults.json")) as f:
            defaults = json.load(f)
            _global_closure_rate = defaults["global_closure_rate"]
            _global_priority_rate = defaults["global_priority_rate"]

        _loaded = True

    except Exception as e:
        raise RuntimeError(f"Failed to load authority ML models: {e}")


# ── Feature columns ────────────────────────────────────────────────────────────
CLOSURE_FEATURES = [
    "event_type", "latitude", "longitude", "event_cause", "authenticated",
    "hour", "dayofweek", "month",
    "veh_type_enhanced", "cause_vehicle", "geohash_6",
    "historical_incident_count", "historical_closure_rate", "historical_priority_rate",
]

PRIORITY_FEATURES = CLOSURE_FEATURES + ["closure_prob_oof"]


# ── Feature engineering (inlined to avoid import path issues) ──────────────────

def _encode_geohash(lat: float, lon: float, precision: int = 6) -> str:
    """Pure-Python geohash encoding — no external dependency needed."""
    BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
    min_lat, max_lat = -90.0, 90.0
    min_lon, max_lon = -180.0, 180.0
    bits = [16, 8, 4, 2, 1]
    bit_idx = 0
    is_even = True
    char_idx = 0
    geohash = []

    while len(geohash) < precision:
        if is_even:
            mid = (min_lon + max_lon) / 2
            if lon >= mid:
                char_idx |= bits[bit_idx]
                min_lon = mid
            else:
                max_lon = mid
        else:
            mid = (min_lat + max_lat) / 2
            if lat >= mid:
                char_idx |= bits[bit_idx]
                min_lat = mid
            else:
                max_lat = mid

        is_even = not is_even
        if bit_idx < 4:
            bit_idx += 1
        else:
            geohash.append(BASE32[char_idx])
            bit_idx = 0
            char_idx = 0

    return "".join(geohash)


def _extract_vehicle_from_description(description: str) -> str | None:
    if not description:
        return None
    d = description.lower()
    if "bmtc" in d:        return "bmtc_bus"
    if "ksrtc" in d:       return "ksrtc_bus"
    if "private bus" in d: return "private_bus"
    if "school bus" in d:  return "private_bus"
    if "bus" in d:         return "bus"
    if "heavy vehicle" in d: return "heavy_vehicle"
    if "truck" in d or "lorry" in d or "container" in d or "tanker" in d or "tipper" in d:
        return "truck"
    if "lcv" in d or "tempo" in d: return "lcv"
    if "taxi" in d or "cab" in d or "uber" in d or "ola" in d: return "taxi"
    if "auto" in d:        return "auto"
    if "car" in d:         return "private_car"
    return None


def _build_features(
    event_type: str,
    latitude: float,
    longitude: float,
    event_cause: str,
    authenticated: bool,
    veh_type: str | None,
    start_datetime: str,
    description: str,
) -> pd.DataFrame:
    # Datetime features
    dt = pd.to_datetime(start_datetime, format="mixed", errors="coerce", utc=True)
    hour = int(dt.hour)
    dayofweek = int(dt.dayofweek)
    month = int(dt.month)

    # Vehicle type enhanced
    vt = (veh_type or "").strip().lower()
    if not vt or vt in ("others", "null", ""):
        veh_type_enhanced = _extract_vehicle_from_description(description) or "missing_vehicle"
    else:
        veh_type_enhanced = vt

    cause_vehicle = f"{event_cause}_{veh_type_enhanced}"

    # Spatial features
    geohash_6 = _encode_geohash(latitude, longitude, 6)
    historical_incident_count = int(_incident_count_map.get(geohash_6, 0))
    historical_closure_rate = float(_closure_rate_map.get(geohash_6, _global_closure_rate))
    historical_priority_rate = float(_priority_rate_map.get(geohash_6, _global_priority_rate))

    return pd.DataFrame([{
        "event_type": event_type,
        "latitude": latitude,
        "longitude": longitude,
        "event_cause": event_cause,
        "authenticated": authenticated,
        "hour": hour,
        "dayofweek": dayofweek,
        "month": month,
        "veh_type_enhanced": veh_type_enhanced,
        "cause_vehicle": cause_vehicle,
        "geohash_6": geohash_6,
        "historical_incident_count": historical_incident_count,
        "historical_closure_rate": historical_closure_rate,
        "historical_priority_rate": historical_priority_rate,
    }])


# ── Public API ─────────────────────────────────────────────────────────────────

def predict(
    event_type: str,
    latitude: float,
    longitude: float,
    event_cause: str,
    authenticated: bool,
    veh_type: str | None,
    start_datetime: str,
    description: str,
) -> dict:
    _load()

    df = _build_features(
        event_type, latitude, longitude, event_cause,
        authenticated, veh_type, start_datetime, description,
    )

    closure_prob = float(
        _closure_model.predict_proba(df[CLOSURE_FEATURES])[:, 1][0]
    )
    closure_pred = bool(closure_prob >= _closure_threshold)

    df["closure_prob_oof"] = closure_prob

    priority_prob = float(
        _priority_model.predict_proba(df[PRIORITY_FEATURES])[:, 1][0]
    )
    priority_pred = "High" if priority_prob >= _priority_threshold else "Low"

    return {
        "closure_probability": round(closure_prob, 4),
        "closure_prediction": closure_pred,
        "priority_probability": round(priority_prob, 4),
        "priority_prediction": priority_pred,
    }
