"""Simple in-memory store. Swap for Supabase/Postgres later.
Pre-seeded with realistic Bengaluru data so the demo looks alive on first load.
"""
from datetime import datetime, timedelta
import uuid, random, string

def _id(): return str(uuid.uuid4())
def _tracking(): return "RPT-2026-" + "".join(random.choices(string.digits, k=4))
def _ago(mins): return (datetime.utcnow() - timedelta(minutes=mins)).isoformat()

INCIDENTS = [
    {"id": _id(), "event_type": "accident", "event_cause": "accident", "latitude": 12.9170, "longitude": 77.6230,
     "address": "Silk Board Junction", "corridor": "Hosur Road", "zone": "South Zone 2", "police_station": "Madiwala",
     "priority": "High", "status": "active", "requires_road_closure": True, "description": "Truck accident, two lanes blocked",
     "start_datetime": _ago(2)},
    {"id": _id(), "event_type": "water_logging", "event_cause": "water_logging", "latitude": 13.0436, "longitude": 77.6206,
     "address": "Nagavara ORR Junction", "corridor": "ORR North", "zone": "North Zone 2", "police_station": "Hebbal",
     "priority": "High", "status": "active", "requires_road_closure": False, "description": "Underpass flooded",
     "start_datetime": _ago(11)},
    {"id": _id(), "event_type": "public_event", "event_cause": "public_event", "latitude": 13.0108, "longitude": 77.5858,
     "address": "Mekhri Circle", "corridor": "Bellary Road", "zone": "Central Zone 1", "police_station": "Sadashivanagar",
     "priority": "High", "status": "active", "requires_road_closure": True, "description": "Public gathering",
     "start_datetime": _ago(18)},
    {"id": _id(), "event_type": "tree_fall", "event_cause": "tree_fall", "latitude": 13.0298, "longitude": 77.5525,
     "address": "Yeshwanthpura Circle", "corridor": "Tumkur Road", "zone": "West Zone 1", "police_station": "Yeshwanthpura",
     "priority": "Low", "status": "closed", "requires_road_closure": False, "description": "Tree fall cleared",
     "start_datetime": _ago(45)},
    {"id": _id(), "event_type": "vehicle_breakdown", "event_cause": "vehicle_breakdown", "latitude": 12.9767, "longitude": 77.5713,
     "address": "KR Circle", "corridor": "Mysore Road", "zone": "Central Zone 2", "police_station": "Cubbon Park",
     "priority": "Low", "status": "active", "requires_road_closure": False, "description": "Auto breakdown",
     "start_datetime": _ago(6)},
    # ── Incidents along City Station → Whitefield corridor ──────────
    {"id": _id(), "event_type": "accident", "event_cause": "accident", "latitude": 12.9780, "longitude": 77.6450,
     "address": "Old Airport Road, Indiranagar", "corridor": "Old Airport Road", "zone": "East Zone 1", "police_station": "Indiranagar",
     "priority": "High", "status": "active", "requires_road_closure": True, "description": "Multi-vehicle collision, road blocked",
     "start_datetime": _ago(14)},
    {"id": _id(), "event_type": "construction", "event_cause": "construction", "latitude": 12.9562, "longitude": 77.7008,
     "address": "Marathahalli Bridge", "corridor": "ORR East", "zone": "East Zone 2", "police_station": "Marathahalli",
     "priority": "High", "status": "active", "requires_road_closure": True, "description": "Bridge repair, right lane closed",
     "start_datetime": _ago(30)},
    {"id": _id(), "event_type": "debris", "event_cause": "debris", "latitude": 12.9690, "longitude": 77.6750,
     "address": "HAL Airport Road", "corridor": "HAL Road", "zone": "East Zone 1", "police_station": "HAL",
     "priority": "Medium", "status": "active", "requires_road_closure": False, "description": "Debris on road, slow traffic",
     "start_datetime": _ago(8)},
]

REPORTS = [
    {"id": _id(), "tracking_id": "RPT-2026-4461", "category": "Waterlogging", "description": "Underpass flooded, two-wheelers stuck",
     "address": "Nagavara ORR", "latitude": 13.0436, "longitude": 77.6206, "photo_url": None,
     "status": "pending", "created_at": _ago(120)},
    {"id": _id(), "tracking_id": "RPT-2026-4389", "category": "Signal failure", "description": "Traffic signal not working",
     "address": "KR Circle", "latitude": 12.9767, "longitude": 77.5713, "photo_url": None,
     "status": "approved", "created_at": _ago(1440)},
    {"id": _id(), "tracking_id": "RPT-2026-4201", "category": "Tree fall", "description": "Large branch on road",
     "address": "MG Road", "latitude": 12.9756, "longitude": 77.6068, "photo_url": None,
     "status": "resolved", "created_at": _ago(4320)},
]

PREDICTIONS = []

# Added for Feature 6 (Command Center) / advisory_service.py — same
# in-memory-log pattern as PREDICTIONS above, not a new persistence
# mechanism.
ADVISORIES = []
