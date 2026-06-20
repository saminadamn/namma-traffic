"""
Feature 2 — Event Impact Simulator.

SCOPE NOTE: zone adjacency below (ZONE_ADJACENCY) is a small static
lookup table, not a real GIS boundary/graph dataset — Bengaluru zone
polygons and a real adjacency graph don't exist anywhere in this repo.
Treat this as a reasonable placeholder for the demo; replacing it with
real ward/zone boundary data is a follow-up, not a redesign of this
function's interface.
"""
import math

from services.model_service import ZONE_HISTORY

EVENT_IMPACT = {
    "political_rally": {"base_increase_pct": 45, "radius_zones": 2, "label": "Political Rally"},
    "concert":          {"base_increase_pct": 35, "radius_zones": 1, "label": "Concert"},
    "cricket_match":    {"base_increase_pct": 55, "radius_zones": 2, "label": "Cricket Match"},
    "road_closure":     {"base_increase_pct": 60, "radius_zones": 1, "label": "Road Closure"},
}

# Approximate neighboring-zone lookup — see module docstring.
ZONE_ADJACENCY = {
    "Central Zone 1": ["Central Zone 2", "North Zone 1", "South Zone 1"],
    "Central Zone 2": ["Central Zone 1", "South Zone 2", "East Zone 1"],
    "North Zone 1":   ["Central Zone 1", "North Zone 2"],
    "North Zone 2":   ["North Zone 1", "West Zone 1"],
    "South Zone 1":   ["Central Zone 1", "South Zone 2"],
    "South Zone 2":   ["South Zone 1", "Central Zone 2", "East Zone 1"],
    "West Zone 1":    ["North Zone 2", "Central Zone 1"],
    "East Zone 1":    ["Central Zone 2", "South Zone 2"],
}


def simulate_event(event_type: str, zone: str, expected_attendance: int | None = None,
                    duration_hours: float | None = None) -> dict:
    impact = EVENT_IMPACT.get(event_type)
    if impact is None:
        raise ValueError(f"Unknown event_type '{event_type}'. Expected one of {list(EVENT_IMPACT)}.")

    increase_pct = impact["base_increase_pct"]
    # Scale modestly with crowd size — every 1,000 attendees above a
    # 5,000 baseline adds 1 point, capped so a single input can't blow
    # the estimate past a sane ceiling.
    if expected_attendance and expected_attendance > 5000:
        increase_pct += min(20, (expected_attendance - 5000) // 1000)
    increase_pct = min(increase_pct, 95)

    base_rate, base_count = ZONE_HISTORY.get(zone, (0.06, 100))
    baseline_congestion_pct = round(base_rate * 100 + 20)  # same rough scaling style as model_service's fallback
    projected_congestion_pct = min(round(baseline_congestion_pct * (1 + increase_pct / 100)), 100)

    affected_zones = [zone] + ZONE_ADJACENCY.get(zone, [])[: impact["radius_zones"]]

    # Officer recommendation: scales with severity of the increase and
    # with crowd size, floored so even a "small" event gets a minimum
    # visible presence, capped at a plausible single-event deployment.
    officers = 6 + round(increase_pct / 5)
    if expected_attendance:
        officers += expected_attendance // 2500
    officers = max(6, min(int(officers), 80))

    barricades = max(2, round(officers / 3))

    return {
        "event_type": event_type,
        "event_label": impact["label"],
        "zone": zone,
        "expected_congestion_increase_pct": increase_pct,
        "baseline_congestion_pct": baseline_congestion_pct,
        "projected_congestion_pct": projected_congestion_pct,
        "affected_zones": affected_zones,
        "recommended_officers": officers,
        "recommended_barricades": barricades,
        "duration_hours": duration_hours,
        "basis": "Computed from historical event-impact data and zone traffic baselines.",
    }
