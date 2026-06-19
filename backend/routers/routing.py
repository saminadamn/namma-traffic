"""
routing.py
----------
Incident-aware safe-route endpoint using OSRM public demo server.
Offloads all graph routing to http://router.project-osrm.org — zero local RAM.
Incidents within 500m of the returned path are flagged from the live store.
"""
from __future__ import annotations

import math

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
    total_travel_time_s: float
    total_distance_m: float
    incidents_avoided: list[IncidentInfo]
    incidents_on_route: list[IncidentInfo]
    warnings: list[str]


@router.post("", response_model=RouteResponse)
def find_route(req: RouteRequest):
    url = _OSRM.format(
        lon1=req.origin_lon, lat1=req.origin_lat,
        lon2=req.dest_lon,   lat2=req.dest_lat,
    )
    try:
        resp = httpx.get(url, params={"overview": "full", "geometries": "geojson"}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Routing service unavailable: {exc}")

    if data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(status_code=422, detail="No route found between the given points")

    route = data["routes"][0]
    # OSRM returns [lon, lat] — convert to [lat, lon] for our API
    coords = [[c[1], c[0]] for c in route["geometry"]["coordinates"]]

    # Flag live incidents within 500m of the route
    from services.store import INCIDENTS
    on_route: list[IncidentInfo] = []
    warnings: list[str] = []

    for raw in INCIDENTS:
        if raw.get("status") == "closed":
            continue
        inc_lat = float(raw.get("latitude", 0))
        inc_lon = float(raw.get("longitude", 0))
        if _min_dist_to_route(inc_lat, inc_lon, coords) <= _INCIDENT_RADIUS_M:
            score = raw.get("severity_score") or 3
            band = "Critical" if score >= 8 else "High" if score >= 6 else "Medium" if score >= 4 else "Low"
            on_route.append(IncidentInfo(
                id=str(raw["id"]),
                event_cause=str(raw.get("event_cause", "others")),
                severity_band=band,
                requires_road_closure=bool(raw.get("requires_road_closure", False)),
                latitude=inc_lat,
                longitude=inc_lon,
            ))
            if raw.get("requires_road_closure"):
                warnings.append(f"Road closure near {raw.get('address', 'route point')}")

    return RouteResponse(
        path_coords=coords,
        total_travel_time_s=route["duration"],
        total_distance_m=route["distance"],
        incidents_avoided=[],
        incidents_on_route=on_route,
        warnings=warnings,
    )
