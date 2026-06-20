"""
Feature 5 — Smart Priority Ranking.

formula (as specified): composite = severity + congestion_impact + emergency_proximity,
each normalized to 0-100 first, then weighted (severity weighted highest
since it's the most directly actionable signal an officer has).

EMERGENCY_FACILITIES is a small, hand-picked list of real well-known
Bengaluru hospitals — approximate coordinates, good enough for a
"how close is this incident to emergency infrastructure" demo signal.
It is not a complete or authoritative facility registry.
"""
import math

from services.model_service import ZONE_HISTORY

EMERGENCY_FACILITIES = [
    {"name": "Victoria Hospital", "lat": 12.9634, "lon": 77.5747},
    {"name": "St. John's Medical College Hospital", "lat": 12.9279, "lon": 77.6238},
    {"name": "Bowring & Lady Curzon Hospital", "lat": 12.9869, "lon": 77.5996},
    {"name": "Manipal Hospital Old Airport Road", "lat": 12.9583, "lon": 77.6483},
    {"name": "Fortis Hospital Bannerghatta", "lat": 12.8893, "lon": 77.5972},
    {"name": "Columbia Asia Hebbal", "lat": 13.0481, "lon": 77.5921},
]

# ML closure_probability is included as a fourth signal when available.
# Weights sum to 1.0 when ML is present; fall back to the three-factor
# formula (renormalized) when closure_probability is NULL.
WEIGHTS = {"severity": 0.40, "congestion": 0.25, "emergency_proximity": 0.15, "ml_closure": 0.20}


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(a)))


def emergency_proximity_score(lat: float, lon: float) -> float:
    """0-100: 100 = right next to an emergency facility, decaying with
    distance. 5km is treated as 'far enough that proximity stops being
    a meaningful priority signal' for this demo's purposes."""
    nearest_km = min(_haversine_km(lat, lon, f["lat"], f["lon"]) for f in EMERGENCY_FACILITIES)
    return round(max(0.0, 100 * (1 - nearest_km / 5.0)), 1)


def congestion_impact_score(zone: str | None) -> float:
    rate, _ = ZONE_HISTORY.get(zone, (0.06, 100))
    return round(min(rate * 100 + 20, 100), 1)


def composite_priority_score(
    severity_score: float,
    congestion_impact: float,
    emergency_proximity: float,
    closure_probability: float | None = None,
) -> float:
    if closure_probability is not None:
        # Full four-factor formula when ML closure probability is available
        return round(
            severity_score      * WEIGHTS["severity"]
            + congestion_impact * WEIGHTS["congestion"]
            + emergency_proximity * WEIGHTS["emergency_proximity"]
            + closure_probability * 100 * WEIGHTS["ml_closure"],
            1,
        )
    # Fallback: renormalize three-factor weights to sum to 1.0
    w_sum = WEIGHTS["severity"] + WEIGHTS["congestion"] + WEIGHTS["emergency_proximity"]
    return round(
        severity_score      * (WEIGHTS["severity"]            / w_sum)
        + congestion_impact * (WEIGHTS["congestion"]          / w_sum)
        + emergency_proximity * (WEIGHTS["emergency_proximity"] / w_sum),
        1,
    )


def rank_incidents(incidents: list[dict], limit: int = 10) -> list[dict]:
    """Pure function over a list of incident dicts shaped like
    services/incident_service.py's _incident_to_dict() output.
    Uses ML closure_probability when available, falls back to three-factor
    formula when the column is NULL (older incidents or ML unavailable)."""
    ranked = []
    for inc in incidents:
        severity   = inc.get("severity_score") or 0
        congestion = congestion_impact_score(inc.get("zone"))
        proximity  = emergency_proximity_score(inc["latitude"], inc["longitude"])
        closure_p  = inc.get("closure_probability")   # None if not yet scored
        composite  = composite_priority_score(severity, congestion, proximity, closure_p)
        ranked.append({
            **inc,
            "congestion_impact_score": congestion,
            "emergency_proximity_score": proximity,
            "closure_probability": closure_p,
            "priority_score": composite,
        })
    ranked.sort(key=lambda r: r["priority_score"], reverse=True)
    return ranked[:limit]
