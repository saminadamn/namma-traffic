from fastapi import APIRouter, HTTPException

from schemas.features import SimulateEventRequest, SimulateEventResponse
from services import simulation_service

router = APIRouter()


@router.post("", response_model=SimulateEventResponse)
def simulate_event(body: SimulateEventRequest):
    try:
        return simulation_service.simulate_event(
            body.event_type, body.zone, body.expected_attendance, body.duration_hours,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
