"""
Feature 1 — Explainable AI.

GET, not POST, per the spec — EventInput's fields are passed as query
parameters. Mirrors the same fields /api/predict (routers/api.py) takes
as a POST body; kept as a GET here specifically because the spec asked
for GET /prediction/explain, and a GET with query params is the correct
way to do that in FastAPI for an idempotent, side-effect-free read.
"""
from fastapi import APIRouter, Query, Request

from schemas.features import ExplainResponse
from schemas.schemas import EventInput
from services import explain_service

router = APIRouter()


@router.get("", response_model=ExplainResponse)
async def explain_prediction(
    request: Request,
    event_type: str = Query(...),
    latitude: float = Query(...),
    longitude: float = Query(...),
    address: str = Query(...),
    corridor: str = Query(...),
    police_station: str = Query(...),
    zone: str = Query(...),
    date: str = Query(...),
    time: str = Query(...),
    crowd_size: int | None = Query(default=None),
    weather: str = Query(default="clear"),
    description: str = Query(default=""),
):
    ev = EventInput(
        event_type=event_type, latitude=latitude, longitude=longitude, address=address,
        corridor=corridor, police_station=police_station, zone=zone, date=date, time=time,
        crowd_size=crowd_size, weather=weather, description=description,
    )
    model_service = request.app.state.model_service
    return explain_service.explain(model_service, ev)
