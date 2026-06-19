"""
routing.py
----------
Incident-aware safe-route endpoint using OSRM public demo server.
- Requests up to 3 alternative routes from OSRM
- Scores each by incident severity (road closures penalised 10×)
- Returns the safest route plus the rejected "dangerous" route for map display
"""
from __future__ import annotations

import math
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

_OSRM = "http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}"
_INCIDENT_RADIUS_M = 500


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _min_dist_to_route(lat: float, lon: float, coords: list[list[float]]) -> float:
    return min(_haversine_m(lat, lon, c[0], c[1]) for c in coords) if coords else float("inf")


def _band(severity_score: float) -> str:
    if severity_score >= 8: return "Critical"
    if severity_score >= 6: return "High"
    if severity_score >= 4: return "Medium"
    return "Low"


class RouteRequest(BaseModel):
    origin_lat: float = Field(..., ge=-90,  le=90)
    origin_lon: float = Field(..., ge=-180, le=180)
    dest_lat:   float = Field(..., ge=-90,  le=90)
    dest_lon:   float = Field(..., ge=-180, le=180)


class IncidentInfo(BaseModel):
    id: str
    event_cause: str
    severity_band: str
    requires_road_closure: bool
    latitude: float
    longitude: float


class RouteResponse(BaseModel):
    path_coords: list[list[float]]
    alternative_path_coords: list[list[float]]   # the rejected, more dangerous route
    total_travel_time_s: float
    total_distance_m: float
    incidents_avoided: list[IncidentInfo]
    incidents_on_route: list[IncidentInfo]
    warnings: list[str]


def _score_route(coords: list[list[float]], active_incidents: list[dict]) -> float:
    """Lower is safer. Road closures = 10× penalty."""
    total = 0.0
    for raw in active_incidents:
        lat = float(raw.get("latitude", 0))
        lon = float(raw.get("longitude", 0))
        if _min_dist_to_route(lat, lon, coords) <= _INCIDENT_RADIUS_M:
            sev = float(raw.get("severity_score") or 3)
            if raw.get("requires_road_closure"):
                sev *= 10
            total += sev
    return total


def _incidents_near(coords: list[list[float]], active_incidents: list[dict]) -> list[IncidentInfo]:
    result = []
    for raw in active_incidents:
        lat = float(raw.get("latitude", 0))
        lon = float(raw.get("longitude", 0))
        if _min_dist_to_route(lat, lon, coords) <= _INCIDENT_RADIUS_M:
            result.append(IncidentInfo(
                id=str(raw["id"]),
                event_cause=str(raw.get("event_cause", "others")),
                severity_band=_band(float(raw.get("severity_score") or 3)),
                requires_road_closure=bool(raw.get("requires_road_closure", False)),
                latitude=lat,
                longitude=lon,
            ))
    return result


@router.post("", response_model=RouteResponse)
def find_route(req: RouteRequest):
    url = _OSRM.format(
        lon1=req.origin_lon, lat1=req.origin_lat,
        lon2=req.dest_lon,   lat2=req.dest_lat,
    )
    try:
        resp = httpx.get(url, params={
            "overview": "full",
            "geometries": "geojson",
            "alternatives": "true",   # ask for up to 3 route alternatives
        }, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Routing service unavailable: {exc}")

    if data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(status_code=422, detail="No route found between the given points")

    osrm_routes = data["routes"]

    # Convert all routes from [lon, lat] → [lat, lon]
    all_coords = [
        [[c[1], c[0]] for c in r["geometry"]["coordinates"]]
        for r in osrm_routes
    ]

    # Load live incidents
    from services.store import INCIDENTS
    active = [i for i in INCIDENTS if i.get("status") != "closed"]

    # Score each route; pick the one with the lowest danger score
    scores = [_score_route(coords, active) for coords in all_coords]
    best_idx = scores.index(min(scores))

    # The "rejected" route is the highest-scoring one we chose NOT to take
    worst_idx = scores.index(max(scores)) if len(scores) > 1 else best_idx
    alt_coords: list[list[float]] = (
        all_coords[worst_idx] if worst_idx != best_idx else []
    )

    best_coords = all_coords[best_idx]
    best_route  = osrm_routes[best_idx]

    on_route = _incidents_near(best_coords, active)
    on_route_ids = {i.id for i in on_route}

    # Avoided = near any REJECTED route but NOT on our chosen route
    avoided: list[IncidentInfo] = []
    avoided_ids: set[str] = set()
    for idx, other_coords in enumerate(all_coords):
        if idx == best_idx:
            continue
        for inc in _incidents_near(other_coords, active):
            if inc.id not in on_route_ids and inc.id not in avoided_ids:
                avoided.append(inc)
                avoided_ids.add(inc.id)

    warnings: list[str] = []
    for inc in on_route:
        if inc.requires_road_closure:
            warnings.append(f"Road closure near route — expect delays")

    return RouteResponse(
        path_coords=best_coords,
        alternative_path_coords=alt_coords,
        total_travel_time_s=best_route["duration"],
        total_distance_m=best_route["distance"],
        incidents_avoided=avoided,
        incidents_on_route=on_route,
        warnings=warnings,
    )
