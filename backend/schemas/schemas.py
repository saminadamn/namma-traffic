from pydantic import BaseModel
from typing import Optional, Literal

class EventInput(BaseModel):
    # Core event fields (used by BRE + existing model)
    event_type: str          # event_cause for ML model (vehicle_breakdown, accident…)
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
    # ML model fields (added for CatBoost integration)
    incident_type: str = "unplanned"       # ML event_type: "planned" | "unplanned"
    veh_type: Optional[str] = None         # vehicle type for enhanced feature
    authenticated_reporter: bool = True    # ML authenticated field

class SHAPFeature(BaseModel):
    feature: str
    value: float
    direction: Literal["positive", "negative"]

class PredictionOutput(BaseModel):
    # ── ML model outputs (raw probabilities) ──────────────────────────────────
    closure_probability: float
    closure_prediction: bool
    priority_probability: float
    priority_prediction: Literal["High", "Low"]
    # ── Business Rules Engine outputs (operational recommendations) ───────────
    risk_score: int
    risk_band: Literal["Low", "Moderate", "High", "Critical"]
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
