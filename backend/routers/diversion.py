"""
Diversion Planning Engine — FastAPI router.

Wires the engine's services to our existing PostgreSQL DB and Incident ORM
model. Does NOT use the engine's own IncidentRepository or db_session —
those exist only in the standalone ZIP. We use our get_db + db_models here.

Endpoints:
    POST /diversion/plan             Generate a diversion plan for an incident_id.
    GET  /diversion/incidents        List active incidents with road_status.
    GET  /diversion/status           Health check.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.database import get_db
from db_models.incident import Incident
from diversion_engine.models.schemas import (
    ActiveIncidentSummary, ActiveIncidentsResponse,
    DiversionPlanRequest, DiversionPlanResponse,
    EventType, HealthResponse, IncidentInput, IncidentStatus, Priority, RoadStatus,
)
from diversion_engine.services.diversion_planning_service import DiversionPlanningService
from diversion_engine.services.incident_impact_service import (
    IncidentImpactService, IncidentValidationError,
)
from diversion_engine.services.map_matching_service import MapMatchingService
from diversion_engine.services.road_network_service import RoadNetworkService

logger = logging.getLogger("namma_traffic.diversion")

router = APIRouter(tags=["Diversion Planning Engine"])

# Module-level RoadNetworkService — shared across requests so OSMnx only
# downloads the road graph once per unique location, not on every API call.
_shared_rns = RoadNetworkService()


# ── Dependency ────────────────────────────────────────────────────────────────

def _build_service(db: Session) -> tuple[DiversionPlanningService, Session]:
    """Assemble the full service graph. persist_callback writes road_status
    and affected_road back to our Incident model after planning."""

    def _persist(incident_id: str, road_status: str, affected_road: str) -> None:
        inc = db.query(Incident).filter(Incident.id == incident_id).first()
        if inc:
            inc.road_status   = road_status
            inc.affected_road = affected_road
            try:
                db.commit()
            except Exception:
                db.rollback()

    svc = DiversionPlanningService(
        impact_service=IncidentImpactService(),
        map_matching_service=MapMatchingService(road_network_service=_shared_rns),
        road_network_service=_shared_rns,
        persist_callback=_persist,
    )
    return svc, db


def _to_incident_input(inc: Incident) -> IncidentInput:
    """Adapt our Incident ORM row to the engine's IncidentInput schema."""
    # closure_probability may be NULL on old rows — default to 0.0
    closure_prob = float(inc.closure_probability or 0.0)

    # The router already checks inc.status == "active" before calling this.
    # The diversion engine's validate_incident requires authenticated=True for
    # any active incident, so we set it unconditionally here.
    authenticated = True

    # Map our priority string to the engine's Priority enum
    pri_map = {"High": Priority.HIGH, "Low": Priority.LOW}
    priority = pri_map.get(inc.priority or "High", Priority.HIGH)

    # Map incident_type to engine's EventType
    event_type = EventType.PLANNED if getattr(inc, "incident_type", None) == "planned" else EventType.UNPLANNED

    return IncidentInput(
        incident_id=str(inc.id),
        latitude=inc.latitude,
        longitude=inc.longitude,
        event_type=event_type,
        event_cause=inc.event_cause or "others",
        authenticated=authenticated,
        status=IncidentStatus.ACTIVE,
        priority=priority,
        closure_probability=min(max(closure_prob, 0.0), 1.0),
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post(
    "/diversion/plan",
    response_model=DiversionPlanResponse,
    summary="Generate a diversion plan for an incident.",
)
def generate_diversion_plan(
    request: DiversionPlanRequest,
    db: Session = Depends(get_db),
) -> DiversionPlanResponse:
    """
    Fetches the incident from our DB, runs map matching against the OSM road
    graph around the incident location, ranks alternative roads, and returns
    a ranked diversion plan. Also writes road_status and affected_road back
    to the incident row.
    """
    try:
        inc = db.query(Incident).filter(Incident.id == request.incident_id).first()
    except Exception as exc:
        logger.error("DB error fetching incident %s: %s", request.incident_id, exc)
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    if inc is None:
        raise HTTPException(status_code=404, detail=f"Incident '{request.incident_id}' not found.")

    if inc.status != "active":
        raise HTTPException(
            status_code=400,
            detail=f"Incident is '{inc.status}' — only active incidents can have diversion plans generated.",
        )

    try:
        incident_input = _to_incident_input(inc)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Incident data error: {exc}") from exc

    svc, _ = _build_service(db)

    try:
        plan = svc.generate_diversion_plan(incident_input)
    except IncidentValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("OSM error for incident %s: %s", request.incident_id, exc)
        raise HTTPException(status_code=503, detail=f"Road network unavailable: {exc}") from exc
    except Exception as exc:
        logger.error("Diversion plan error for incident %s: %s", request.incident_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Diversion planning failed: {exc}") from exc

    return plan


@router.get(
    "/diversion/incidents",
    response_model=ActiveIncidentsResponse,
    summary="List active incidents with computed road status.",
)
def list_diversion_incidents(db: Session = Depends(get_db)) -> ActiveIncidentsResponse:
    """
    Returns all active incidents, enriched with their diversion road_status
    (computed on the fly from closure_probability for incidents that haven't
    had a plan generated yet, or read from DB if a plan was already run).
    """
    incidents = (
        db.query(Incident)
        .filter(Incident.status == "active")
        .order_by(Incident.start_datetime.desc())
        .all()
    )
    impact_svc = IncidentImpactService()
    summaries  = []
    for inc in incidents:
        try:
            road_status = (
                RoadStatus(inc.road_status)
                if inc.road_status
                else impact_svc.classify_road_status(float(inc.closure_probability or 0.0))
            )
        except (ValueError, Exception):
            road_status = RoadStatus.UNKNOWN

        pri_map = {"High": Priority.HIGH, "Low": Priority.LOW}
        priority = pri_map.get(inc.priority or "High", Priority.HIGH).value

        summaries.append(ActiveIncidentSummary(
            incident_id=str(inc.id),
            latitude=inc.latitude,
            longitude=inc.longitude,
            status=inc.status,
            priority=priority,
            closure_probability=float(inc.closure_probability or 0.0),
            road_status=road_status,
        ))

    return ActiveIncidentsResponse(total=len(summaries), incidents=summaries)


@router.get(
    "/diversion/status",
    response_model=HealthResponse,
    summary="Health check for the Diversion Planning Engine.",
)
def health_check(db: Session = Depends(get_db)) -> HealthResponse:
    db_status = "ok"
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = f"error: {exc}"
    return HealthResponse(status="ok", version="1.0.0", database=db_status)
