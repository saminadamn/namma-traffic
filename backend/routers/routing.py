"""
routing.py
----------
Incident-aware safe-route endpoint backed by the astram_routing library.
Uses the real Bengaluru OSM road network (downloaded via OSMnx on first
request, cached to cache/bengaluru_drive.graphml for subsequent runs).
Incidents are sourced from the live in-memory INCIDENTS store.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

# ---------------------------------------------------------------------------
# Singleton router (built lazily on first request)
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_incident_router = None


def _get_router():
    global _incident_router
    if _incident_router is not None:
        return _incident_router
    with _lock:
        if _incident_router is not None:
            return _incident_router

        from astram_routing import load_graph, IncidentRouter
        from astram_routing.incidents import Incident, haversine_m, _BASE_SEVERITY
        from services.store import INCIDENTS

        import logging
        logging.getLogger("namma_traffic").info("Building synthetic Bengaluru road graph")
        G = load_graph(backend="synthetic")

        class LiveIncidentStore:
            """Wraps the in-memory INCIDENTS list as an IncidentStore interface."""

            def _build(self) -> list[Incident]:
                out: list[Incident] = []
                for raw in INCIDENTS:
                    if raw.get("status") == "closed":
                        continue
                    cause = str(raw.get("event_cause", "others"))
                    score = _BASE_SEVERITY.get(cause, 0.3)
                    if raw.get("requires_road_closure"):
                        score = min(1.0, score + 0.15)
                    if raw.get("priority") == "High":
                        score = min(1.0, score + 0.05)
                    out.append(Incident(
                        id=str(raw["id"]),
                        latitude=float(raw["latitude"]),
                        longitude=float(raw["longitude"]),
                        event_cause=cause,
                        priority=str(raw.get("priority", "Low")),
                        status=str(raw.get("status", "active")),
                        requires_road_closure=bool(raw.get("requires_road_closure", False)),
                        corridor=str(raw.get("corridor", "")),
                        zone=raw.get("zone"),
                        start_datetime=datetime(2024, 1, 1, tzinfo=timezone.utc),
                        closed_datetime=None,
                        severity=round(min(1.0, score), 3),
                    ))
                return out

            def active_at(self, query_time: datetime) -> list[Incident]:
                return self._build()

            def within_radius(self, lat: float, lon: float, radius_m: float, query_time=None) -> list[Incident]:
                pool = self._build()
                return [i for i in pool if haversine_m(lat, lon, i.latitude, i.longitude) <= radius_m]

        _incident_router = IncidentRouter(G, LiveIncidentStore())
    return _incident_router


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("", response_model=RouteResponse)
def find_route(req: RouteRequest):
    try:
        ir = _get_router()
        result = ir.route(
            origin=(req.origin_lat, req.origin_lon),
            destination=(req.dest_lat, req.dest_lon),
            query_time=datetime.now(tz=timezone.utc),
        )
    except MemoryError:
        raise HTTPException(status_code=503, detail="Route service unavailable: insufficient memory on this plan")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Route service unavailable: {exc}")

    def _info(i) -> IncidentInfo:
        return IncidentInfo(
            id=i.id,
            event_cause=i.event_cause,
            severity_band=i.severity_band,
            requires_road_closure=i.requires_road_closure,
            latitude=i.latitude,
            longitude=i.longitude,
        )

    return RouteResponse(
        path_coords=[[lat, lon] for lat, lon in result.path_coords],
        total_travel_time_s=result.total_travel_time_s,
        total_distance_m=result.total_distance_m,
        incidents_avoided=[_info(i) for i in result.incidents_avoided],
        incidents_on_route=[_info(i) for i in result.incidents_on_route],
        warnings=[w.message for w in result.warnings],
    )
