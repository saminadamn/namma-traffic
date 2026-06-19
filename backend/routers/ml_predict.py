from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services import catboost_service

router = APIRouter()


class MLPredictInput(BaseModel):
    event_type: str          # "planned" or "unplanned"
    latitude: float
    longitude: float
    event_cause: str
    authenticated: bool
    veh_type: Optional[str] = None
    start_datetime: str      # e.g. "2024-03-07 17:01:48+00"
    description: Optional[str] = ""


class MLPredictOutput(BaseModel):
    closure_probability: float
    closure_prediction: bool
    priority_probability: float
    priority_prediction: str


@router.post("", response_model=MLPredictOutput)
def ml_predict(body: MLPredictInput):
    return catboost_service.predict(
        event_type=body.event_type,
        latitude=body.latitude,
        longitude=body.longitude,
        event_cause=body.event_cause,
        authenticated=body.authenticated,
        veh_type=body.veh_type,
        start_datetime=body.start_datetime,
        description=body.description or "",
    )
