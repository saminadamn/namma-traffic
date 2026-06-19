import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from config import get_settings

CORRIDOR_HISTORY = {
    "Hosur Road": (0.087, 64), "ORR North": (0.071, 52), "Bellary Road": (0.064, 43),
    "Mysore Road": (0.042, 31), "Tumkur Road": (0.031, 28), "MG Road": (0.055, 39),
    "Outer Ring Road": (0.069, 58), "Old Airport Road": (0.048, 33),
}
ZONE_HISTORY = {
    "Central Zone 1": (0.081, 623), "Central Zone 2": (0.076, 598), "North Zone 1": (0.062, 413),
    "North Zone 2": (0.058, 389), "South Zone 1": (0.071, 445), "South Zone 2": (0.068, 421),
    "West Zone 1": (0.059, 433), "East Zone 1": (0.044, 287),
}
EVENT_TYPE_HISTORY = {
    "public_event": (0.464, 52), "vip_movement": (0.800, 10), "protest": (0.400, 15),
    "procession": (0.264, 38), "construction": (0.265, 57), "vehicle_breakdown": (0.043, 4896),
    "accident": (0.030, 365), "water_logging": (0.085, 458), "tree_fall": (0.394, 284), "debris": (1.000, 12),
}
CLEAN_FEATURES = [
    "hour", "dow", "month", "is_weekend", "is_peak", "is_night", "latitude", "longitude",
    "hist_closure_corridor", "hist_count_corridor", "hist_closure_zone", "hist_count_zone",
    "hist_closure_event_type", "hist_count_event_type", "event_type_enc", "corridor_enc", "zone_enc",
]

RAIN_RISK = {"clear": 0, "light_rain": 8, "rain": 12, "heavy_rain": 20}

def _fallback_breakdown(ev):
    """Decomposes the fallback heuristic's score into its components.

    Added for the Explainable AI endpoint (routers/explain.py): rather
    than re-deriving "why did we get this score" with a second,
    separately-maintained formula that could silently drift out of sync
    with _fallback() below, both now share this single function.
    _fallback() just sums its output — this is the only place the
    scoring rule itself is written.

    Returns component contributions in raw score points (pre-clamp).
    Components can sum above 100; _fallback() clamps the total, but the
    breakdown intentionally does NOT, so percentage-of-contribution
    figures shown to officers stay internally consistent (they always
    sum to 100% of the raw total) even on a clamped 100 score.

    NOTE on "rainfall": ev.weather already existed in EventInput but was
    never read anywhere in this file before — it was a collected-but-
    dead field. Wiring it in here is a real, scoped fix, not a new
    feature bolted on; the predict page's UI was simply missing a
    control for it (now added).
    """
    er, _ = EVENT_TYPE_HISTORY.get(ev.event_type, (0.05, 50))
    cr, _ = CORRIDOR_HISTORY.get(ev.corridor, (0.05, 20))
    dt = datetime.strptime(f"{ev.date} {ev.time}", "%Y-%m-%d %H:%M")
    is_weekend = dt.weekday() >= 5
    is_peak = dt.hour in {7, 8, 9, 17, 18, 19, 20, 21}
    rain_component = RAIN_RISK.get((ev.weather or "clear").lower(), 0)

    return {
        "baseline": 40,
        "event_type": int(er * 40),
        "corridor_history": int(cr * 30),
        "peak_hour": 10 if is_peak else 0,
        "weekend": 8 if is_weekend else 0,
        "rainfall": rain_component,
    }


class ModelService:
    def __init__(self):
        self.lgbm = self.xgb = self.tfidf = self.explainer = None
        self.is_loaded = False
        self._load_attempted = False
        self.settings = get_settings()

    def load(self):
        try:
            import shap
            self.lgbm = joblib.load(self.settings.model_path)
            self.xgb = joblib.load(self.settings.xgb_model_path)
            self.tfidf = joblib.load(self.settings.tfidf_path)
            self.explainer = shap.TreeExplainer(self.lgbm)
            self.is_loaded = True
            print("Models loaded")
        except Exception as e:
            print(f"Models not loaded ({e}) — using fallback scorer")
            self.is_loaded = False

    def _ensure_loaded(self):
        if not self._load_attempted:
            self._load_attempted = True
            self.load()

    def _features(self, ev):
        dt = datetime.strptime(f"{ev.date} {ev.time}", "%Y-%m-%d %H:%M")
        cr, cc = CORRIDOR_HISTORY.get(ev.corridor, (0.05, 20))
        zr, zc = ZONE_HISTORY.get(ev.zone, (0.06, 100))
        er, ec = EVENT_TYPE_HISTORY.get(ev.event_type, (0.05, 50))
        emap = {k: i for i, k in enumerate(EVENT_TYPE_HISTORY)}
        cmap = {k: i for i, k in enumerate(CORRIDOR_HISTORY)}
        zmap = {k: i for i, k in enumerate(ZONE_HISTORY)}
        return pd.DataFrame([{
            "hour": dt.hour, "dow": dt.weekday(), "month": dt.month,
            "is_weekend": int(dt.weekday() >= 5),
            "is_peak": int(dt.hour in {7,8,9,17,18,19,20,21}),
            "is_night": int(dt.hour in {22,23,0,1,2,3,4,5}),
            "latitude": ev.latitude, "longitude": ev.longitude,
            "hist_closure_corridor": cr, "hist_count_corridor": cc,
            "hist_closure_zone": zr, "hist_count_zone": zc,
            "hist_closure_event_type": er, "hist_count_event_type": ec,
            "event_type_enc": emap.get(ev.event_type, 0),
            "corridor_enc": cmap.get(ev.corridor, 0),
            "zone_enc": zmap.get(ev.zone, 0),
        }])

    def _fallback(self, ev):
        return min(sum(_fallback_breakdown(ev).values()), 100)

    def predict(self, ev):
        self._ensure_loaded()
        X = self._features(ev)
        if self.is_loaded:
            p = 0.55 * float(self.lgbm.predict_proba(X)[0][1]) + 0.45 * float(self.xgb.predict_proba(X)[0][1])
            score = int(p * 100)
            sv = self.explainer.shap_values(X)
            sv = sv[1] if isinstance(sv, list) else sv
            shap_arr = sv[0]
        else:
            score = self._fallback(ev)
            p = score / 100
            shap_arr = np.zeros(len(CLEAN_FEATURES))

        if score < 30:   band, pr = "Low", "P3"
        elif score < 55: band, pr = "Moderate", "P2"
        elif score < 75: band, pr = "High", "P1"
        else:            band, pr = "Critical", "P1"

        feats = []
        for i, name in enumerate(CLEAN_FEATURES):
            v = float(shap_arr[i]) if i < len(shap_arr) else 0.0
            if abs(v) > 0.001:
                feats.append({"feature": name.replace("_", " "), "value": round(abs(v) * 100, 1),
                              "direction": "positive" if v > 0 else "negative"})
        feats = sorted(feats, key=lambda x: x["value"], reverse=True)[:6]

        return {
            "risk_score": score, "risk_band": band,
            "road_closure_probability": round(p, 3),
            "officers_required": max(2, int(score / 7)),
            "barricades_required": max(1, int(score / 12)),
            "diversion_required": p > 0.45,
            "monitoring_priority": pr,
            "shap_features": feats,
            "reasoning": self._reasoning(ev, p),
        }

    def _reasoning(self, ev, p):
        out = []
        dt = datetime.strptime(f"{ev.date} {ev.time}", "%Y-%m-%d %H:%M")
        cr, _ = CORRIDOR_HISTORY.get(ev.corridor, (0.05, 0))
        er, _ = EVENT_TYPE_HISTORY.get(ev.event_type, (0.05, 0))
        if dt.weekday() >= 5 and 10 <= dt.hour <= 20:
            out.append("Weekend daytime — historically 2.3x higher incident rate")
        if cr > 0.06:
            out.append(f"{ev.corridor} has a {round(cr*100)}% historical road closure rate")
        if er > 0.3:
            out.append(f"{ev.event_type.replace('_',' ').title()} needs closure in {round(er*100)}% of cases")
        if dt.hour in {17,18,19,20,21}:
            out.append("Evening peak hour — carriageway saturation likely")
        if dt.month in {6,7,8,9}:
            out.append("Monsoon season — waterlogging risk at low-lying junctions")
        return out[:4]
