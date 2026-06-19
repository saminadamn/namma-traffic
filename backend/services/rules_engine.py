"""
Business Rules Engine — derives operational recommendations from ML probabilities.

Inputs:  closure_probability, closure_prediction, priority_probability,
         priority_prediction (from CatBoost ML model) plus contextual fields
         from the submitted event (event_cause, corridor, weather, crowd_size,
         date, time).

Outputs: risk_score, risk_band, officers_required, barricades_required,
         diversion_required, monitoring_priority, reasoning.
"""
from datetime import datetime

# ── Context tables ─────────────────────────────────────────────────────────────

WEATHER_RISK = {"clear": 0, "light_rain": 4, "rain": 8, "heavy_rain": 12}

# Minimum officer deployments per event cause regardless of ML score
MIN_OFFICERS = {
    "vip_movement": 10, "protest": 8, "procession": 6, "public_event": 6,
    "accident": 4, "vehicle_breakdown": 2, "construction": 4,
    "water_logging": 4, "tree_fall": 4, "debris": 4,
    "congestion": 2, "pot_holes": 2, "road_conditions": 2, "others": 2,
}

PEAK_HOURS = {7, 8, 9, 17, 18, 19, 20, 21}

HIGH_CLOSURE_CORRIDORS = {"Hosur Road", "Outer Ring Road", "MG Road", "ORR North"}


def evaluate(
    *,
    closure_probability: float,
    closure_prediction: bool,
    priority_probability: float,
    priority_prediction: str,
    event_cause: str,
    corridor: str = "",
    weather: str = "clear",
    crowd_size: int | None = None,
    date: str = "",
    time: str = "12:00",
    description: str = "",
) -> dict:

    # ── Temporal context ───────────────────────────────────────────────────────
    try:
        dt = datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M")
        hour = dt.hour
        is_weekend = dt.weekday() >= 5
        is_peak = hour in PEAK_HOURS
        month = dt.month
        is_monsoon = month in {6, 7, 8, 9}
    except ValueError:
        hour, is_weekend, is_peak, month, is_monsoon = 12, False, False, 6, True

    # ── Risk score (0–100) ─────────────────────────────────────────────────────
    # Primary signal: closure probability (0–50 pts) + priority probability (0–30 pts)
    closure_pts  = closure_probability * 50
    priority_pts = priority_probability * 30

    # Contextual boosts
    weather_pts  = WEATHER_RISK.get(weather or "clear", 0)
    peak_pts     = 5 if is_peak else 0
    crowd_pts    = min((crowd_size or 0) / 500, 8)
    corridor_pts = 5 if corridor in HIGH_CLOSURE_CORRIDORS else 0

    raw = closure_pts + priority_pts + weather_pts + peak_pts + crowd_pts + corridor_pts
    risk_score = min(100, int(round(raw)))

    # ── Risk band ──────────────────────────────────────────────────────────────
    if risk_score < 30:   risk_band = "Low"
    elif risk_score < 55: risk_band = "Moderate"
    elif risk_score < 75: risk_band = "High"
    else:                 risk_band = "Critical"

    # ── Officers required ──────────────────────────────────────────────────────
    # ML-driven base (closure prob drives headcount; priority doubles it)
    ml_base = max(2, int(closure_probability * 20))
    if priority_prediction == "High":
        ml_base = max(ml_base, ml_base + 4)

    # Contextual additions
    weather_officers = 2 if weather in {"rain", "heavy_rain"} else 0
    peak_officers    = 2 if is_peak else 0
    crowd_officers   = min(int((crowd_size or 0) / 1000) * 2, 10)

    cause_min = MIN_OFFICERS.get(event_cause, 2)
    officers_required = max(cause_min, ml_base + weather_officers + peak_officers + crowd_officers)

    # ── Barricades ─────────────────────────────────────────────────────────────
    barricades_required = max(1, int(closure_probability * 15))
    if weather in {"rain", "heavy_rain"}:
        barricades_required += 2

    # ── Diversion ─────────────────────────────────────────────────────────────
    diversion_required = closure_prediction or closure_probability > 0.45

    # ── Monitoring priority ────────────────────────────────────────────────────
    if priority_prediction == "High" or closure_prediction or risk_score >= 75:
        monitoring_priority = "P1"
    elif priority_probability > 0.25 or risk_score >= 55:
        monitoring_priority = "P2"
    else:
        monitoring_priority = "P3"

    # ── Reasoning (up to 4 bullets) ────────────────────────────────────────────
    reasoning: list[str] = []

    if closure_probability >= 0.5:
        reasoning.append(
            f"ML model gives {int(closure_probability * 100)}% road closure probability — "
            f"{'closure predicted' if closure_prediction else 'below threshold'}"
        )
    elif closure_probability >= 0.2:
        reasoning.append(
            f"Moderate closure risk ({int(closure_probability * 100)}%) — monitor closely"
        )

    if priority_prediction == "High":
        reasoning.append(
            f"High-priority incident ({int(priority_probability * 100)}% confidence) — P1 response required"
        )

    if is_peak and is_weekend:
        reasoning.append("Weekend peak hour — historically 2.3× higher incident impact")
    elif is_peak:
        reasoning.append("Evening/morning peak — carriageway saturation likely")

    if is_monsoon and weather in {"rain", "heavy_rain"}:
        reasoning.append("Monsoon + active rain — waterlogging risk at low-lying junctions")
    elif weather == "heavy_rain":
        reasoning.append("Heavy rain — reduced visibility and slippery roads")

    if corridor in HIGH_CLOSURE_CORRIDORS:
        reasoning.append(f"{corridor} is a high-incident corridor — expedite deployment")

    return {
        "risk_score":          risk_score,
        "risk_band":           risk_band,
        "officers_required":   officers_required,
        "barricades_required": barricades_required,
        "diversion_required":  diversion_required,
        "monitoring_priority": monitoring_priority,
        "reasoning":           reasoning[:4],
    }
