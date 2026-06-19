"""
Feature 7 — Demo Data Generator.

Reuses incident_service.create_incident() for every generated row —
deliberately not a separate raw-INSERT path — so generated demo
incidents go through the exact same dedup check, severity scoring, and
WebSocket-broadcast hook as a real citizen report would. A demo that
behaves differently from the real pipeline would be a worse demo, not
a better one.

Seed junctions are the SAME coordinates routers/api.py's hotspots()
already hardcodes, not a new invented location list — clicking
"Generate Demo Data" then opening the heatmap should look coherent with
what hotspots() already shows, not contradict it.
"""
import random
from datetime import datetime, timezone

from services import incident_service

SEED_JUNCTIONS = [
    {"junction": "Mekhri Circle", "lat": 13.0108, "lon": 77.5858, "corridor": "Bellary Road", "zone": "Central Zone 1", "police_station": "Sadashivanagar"},
    {"junction": "Ayyappa Temple Junction", "lat": 12.9165, "lon": 77.6101, "corridor": "Hosur Road", "zone": "South Zone 2", "police_station": "Madiwala"},
    {"junction": "Satellite Bus Stand", "lat": 12.9784, "lon": 77.5408, "corridor": "Mysore Road", "zone": "West Zone 1", "police_station": "Yeshwanthpura"},
    {"junction": "Yeshwanthpura Circle", "lat": 13.0298, "lon": 77.5525, "corridor": "Tumkur Road", "zone": "West Zone 1", "police_station": "Yeshwanthpura"},
    {"junction": "Yelahanka Circle", "lat": 13.1007, "lon": 77.5963, "corridor": "Bellary Road", "zone": "North Zone 1", "police_station": "Hebbal"},
    {"junction": "KR Circle", "lat": 12.9767, "lon": 77.5713, "corridor": "Mysore Road", "zone": "Central Zone 2", "police_station": "Cubbon Park"},
    {"junction": "Silk Board Junction", "lat": 12.9170, "lon": 77.6230, "corridor": "Hosur Road", "zone": "South Zone 2", "police_station": "Madiwala"},
    {"junction": "Hebbal Flyover", "lat": 13.0358, "lon": 77.5970, "corridor": "ORR North", "zone": "North Zone 2", "police_station": "Hebbal"},
]

EVENT_BUCKETS = {
    "accidents":         {"event_type": "accident", "priority": "High", "closure": True,
                            "desc": "Multi-vehicle collision reported, lanes obstructed"},
    "roadblocks":        {"event_type": "construction", "priority": "High", "closure": True,
                            "desc": "Barricade/roadblock in place for maintenance work"},
    "congestion_spikes":  {"event_type": "vehicle_breakdown", "priority": "High", "closure": False,
                            "desc": "Sudden congestion spike reported by multiple commuters"},
    "emergency_calls":   {"event_type": "debris", "priority": "High", "closure": True,
                            "desc": "Emergency call received — debris/obstruction on carriageway"},
}


def _jitter(lat: float, lon: float) -> tuple[float, float]:
    """Random offset of roughly 200m–900m so repeated demo-data runs at
    the same junction don't all collapse into one PostGIS dedup match
    (see incident_service.find_duplicate_incident — 150m/10min radius).
    Degrees-to-meters is approximate but more than good enough here."""
    return (
        lat + random.uniform(-0.008, 0.008),
        lon + random.uniform(-0.008, 0.008),
    )


def generate_demo_data(db, counts: dict[str, int] | None = None) -> dict:
    counts = counts or {"accidents": 4, "roadblocks": 3, "congestion_spikes": 4, "emergency_calls": 2}
    created = {bucket: [] for bucket in counts}

    for bucket, n in counts.items():
        spec = EVENT_BUCKETS.get(bucket)
        if spec is None:
            continue
        for _ in range(n):
            seed = random.choice(SEED_JUNCTIONS)
            lat, lon = _jitter(seed["lat"], seed["lon"])
            incident_dict, was_new = incident_service.create_incident(db, {
                "event_type": spec["event_type"],
                "event_cause": spec["event_type"],
                "latitude": lat,
                "longitude": lon,
                "address": f"Near {seed['junction']}",
                "corridor": seed["corridor"],
                "zone": seed["zone"],
                "police_station": seed["police_station"],
                "priority": spec["priority"],
                "requires_road_closure": spec["closure"],
                "description": spec["desc"],
            })
            created[bucket].append(incident_dict)

    total_created = sum(len(v) for v in created.values())
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_created": total_created,
        "breakdown": {k: len(v) for k, v in created.items()},
        "incidents": created,
    }
