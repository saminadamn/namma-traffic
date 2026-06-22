"""
Feature 3 — What-If Analysis ("what happens if Road A is closed?").

SCOPE NOTE, read before extending: CORRIDOR_ALTERNATIVES below is a
static, hand-curated lookup of plausible alternative corridors, NOT the
output of a real shortest-path/graph-routing engine — there is no road
network graph anywhere in this repo (Priority 5 in the original roadmap,
"emergency vehicle routing", was scoped but never built; this reuses
that same honest scoping rather than quietly pretending a graph engine
exists). It's good enough to demo "if X closes, traffic shifts to Y and
Z" credibly; it is not good enough to claim as real routing in front of
someone who asks how the alternative was computed.
"""
from services.model_service import CORRIDOR_HISTORY

CORRIDOR_ALTERNATIVES = {
    "Hosur Road":       ["ORR North", "Outer Ring Road"],
    "ORR North":        ["Hosur Road", "Bellary Road"],
    "Bellary Road":     ["ORR North", "Tumkur Road"],
    "Mysore Road":      ["Outer Ring Road", "Tumkur Road"],
    "Tumkur Road":      ["Bellary Road", "Mysore Road"],
    "MG Road":          ["Old Airport Road", "Outer Ring Road"],
    "Outer Ring Road":  ["Mysore Road", "Hosur Road"],
    "Old Airport Road": ["MG Road", "ORR North"],
}

_TOTAL_HISTORICAL_SHARE = sum(c for _, c in CORRIDOR_HISTORY.values())


def what_if_road_closure(corridor: str, closure_duration_hours: float | None = None) -> dict:
    if corridor not in CORRIDOR_HISTORY:
        raise ValueError(f"Unknown corridor '{corridor}'. Expected one of {list(CORRIDOR_HISTORY)}.")

    closure_rate, historical_count = CORRIDOR_HISTORY[corridor]
    # A corridor that historically carries a bigger share of logged
    # events is treated as carrying a bigger share of daily traffic —
    # a rough but defensible proxy given we have no real traffic-volume
    # counts in this dataset.
    traffic_share_pct = round(historical_count / _TOTAL_HISTORICAL_SHARE * 100, 1)
    alternatives = CORRIDOR_ALTERNATIVES.get(corridor, [])

    # Displaced traffic splits across however many alternatives exist;
    # closure_rate scales how "disruptive" this specific corridor's
    # closure tends to be historically (a corridor that's already
    # closure-prone displaces traffic more severely when it does close).
    n_alts = max(len(alternatives), 1)
    traffic_increase_pct = round((traffic_share_pct / n_alts) * (1 + closure_rate) * 2, 1)
    traffic_increase_pct = min(traffic_increase_pct, 90)

    new_congestion_estimate_pct = min(round(40 + traffic_increase_pct * 0.8), 100)

    return {
        "closed_corridor": corridor,
        "closure_duration_hours": closure_duration_hours,
        "new_congestion_estimate_pct": new_congestion_estimate_pct,
        "traffic_increase_pct": traffic_increase_pct,
        "alternative_routes": [
            {"corridor": alt, "expected_load_increase_pct": round(traffic_increase_pct / n_alts, 1)}
            for alt in alternatives
        ],
        "basis": "Traffic redistribution estimated from historical corridor share data.",
    }
