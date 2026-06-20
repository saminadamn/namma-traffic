"""
Pydantic v2 schemas for the Diversion Planning Engine.
Copied verbatim from the engine ZIP — no changes needed.
"""
from __future__ import annotations
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class RoadStatus(str, Enum):
    CLOSED            = "CLOSED"
    PARTIALLY_BLOCKED = "PARTIALLY_BLOCKED"
    CONGESTED         = "CONGESTED"
    UNKNOWN           = "UNKNOWN"


class SeverityLevel(str, Enum):
    HIGH   = "HIGH"
    MEDIUM = "MEDIUM"
    LOW    = "LOW"


class EventType(str, Enum):
    PLANNED   = "planned"
    UNPLANNED = "unplanned"


class IncidentStatus(str, Enum):
    ACTIVE   = "active"
    RESOLVED = "resolved"
    CLOSED   = "closed"


class Priority(str, Enum):
    HIGH   = "High"
    MEDIUM = "Medium"
    LOW    = "Low"


class IncidentInput(BaseModel):
    incident_id:          str
    latitude:             float
    longitude:            float
    event_type:           EventType
    event_cause:          str
    authenticated:        bool
    status:               IncidentStatus
    priority:             Priority
    closure_probability:  float = Field(..., ge=0.0, le=1.0)

    @field_validator("incident_id")
    @classmethod
    def incident_id_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("incident_id must not be empty.")
        return v.strip()


class DiversionRoad(BaseModel):
    road_name:                 str
    priority:                  int
    road_type:                 Optional[str]   = None
    distance_from_incident_m:  Optional[float] = None


class AffectedRoadInfo(BaseModel):
    road_name:            str
    distance_to_road_m:   float
    nearest_intersection: Optional[str] = None
    road_type:            Optional[str] = None


class DiversionPlanRequest(BaseModel):
    incident_id: str


class DiversionPlanResponse(BaseModel):
    incident_id:             str
    affected_road:           str
    road_status:             RoadStatus
    severity:                SeverityLevel
    diversion_required:      bool
    recommended_diversions:  List[DiversionRoad]
    message:                 Optional[str] = None


class IncidentStatusUpdateRequest(BaseModel):
    incident_id:          str
    closure_probability:  Optional[float]          = Field(default=None, ge=0.0, le=1.0)
    status:               Optional[IncidentStatus] = None

    @field_validator("incident_id")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("incident_id must not be empty.")
        return v.strip()


class IncidentStatusUpdateResponse(BaseModel):
    incident_id: str
    updated:     bool
    message:     str


class ActiveIncidentSummary(BaseModel):
    incident_id:          str
    latitude:             float
    longitude:            float
    status:               str
    priority:             str
    closure_probability:  float
    road_status:          RoadStatus


class ActiveIncidentsResponse(BaseModel):
    total:     int
    incidents: List[ActiveIncidentSummary]


class HealthResponse(BaseModel):
    status:   str
    version:  str
    database: str
