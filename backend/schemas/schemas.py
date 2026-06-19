from pydantic import BaseModel
from typing import Optional, Literal

class EventInput(BaseModel):
    event_type: str
    latitude: float
    longitude: float
    address: str
    corridor: str
    police_station: str
    zone: str
    date: str
    time: str
    crowd_size: Optional[int] = None
    weather: Optional[str] = "clear"
    description: Optional[str] = ""

class SHAPFeature(BaseModel):
    feature: str
    value: float
    direction: Literal["positive", "negative"]

class PredictionOutput(BaseModel):
    risk_score: int
    risk_band: Literal["Low", "Moderate", "High", "Critical"]
    road_closure_probability: float
    officers_required: int
    barricades_required: int
    diversion_required: bool
    monitoring_priority: Literal["P1", "P2", "P3"]
    shap_features: list[SHAPFeature]
    reasoning: list[str]

class IncidentCreate(BaseModel):
    event_type: str
    event_cause: str
    latitude: float
    longitude: float
    address: str
    corridor: str
    zone: str
    police_station: str
    priority: Literal["High", "Low"] = "High"
    requires_road_closure: bool = False
    description: Optional[str] = ""

class VerifyAction(BaseModel):
    report_id: str
    action: Literal["approve", "reject", "pending"]
