"""
Feature 4 — Incident Severity Scoring.

Thresholds (30/55/75) are deliberately the SAME cut points
model_service.py already uses for risk_band (Low/Moderate/High/Critical
at those exact boundaries) — reusing them rather than inventing a
second, slightly-different scale that officers would have to learn
twice for what's conceptually the same risk ladder.
"""
from services.model_service import EVENT_TYPE_HISTORY

PEAK_HOURS = {7, 8, 9, 17, 18, 19, 20, 21}


def label_for_score(score: int) -> str:
    if score < 30:
        return "Low"
    elif score < 55:
        return "Medium"
    elif score < 75:
        return "High"
    return "Critical"


def score_severity(incident_type: str, nearby_congestion_pct: float, hour_of_day: int,
                    requires_road_closure: bool = False) -> dict:
    """incident_type is matched against EVENT_TYPE_HISTORY's closure-rate
    table — the same real, already-computed signal model_service uses,
    rather than a second hand-picked severity-per-type table that could
    say something different about the same incident type."""
    type_rate, _ = EVENT_TYPE_HISTORY.get(incident_type, (0.05, 50))
    type_component = round(type_rate * 40, 1)                       # 0–40
    congestion_component = round(max(0, min(nearby_congestion_pct, 100)) * 0.3, 1)  # 0–30
    time_component = 15 if hour_of_day in PEAK_HOURS else 5          # 5 or 15
    closure_component = 15 if requires_road_closure else 0            # 0 or 15

    raw_score = type_component + congestion_component + time_component + closure_component
    score = min(round(raw_score), 100)
    label = label_for_score(score)

    return {
        "severity_score": score,
        "severity_label": label,
        "components": {
            "incident_type_history": type_component,
            "nearby_congestion": congestion_component,
            "time_of_day": time_component,
            "road_closure": closure_component,
        },
    }
