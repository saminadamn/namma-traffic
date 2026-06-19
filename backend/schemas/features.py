"""
Schemas for the SIH enhancement-sprint features (explain, simulate,
what-if, command center, demo data). Kept separate from schemas/
schemas.py for the same reason schemas/auth.py is separate — different
change cadence, avoids merge conflicts with the original prediction/
incident schemas this sprint deliberately does not touch.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ── Feature 1: Explainable AI ──────────────────────────────────────────
class ContributingFactor(BaseModel):
    factor: str
    contribution_pct: float
    direction: str


class ExplainResponse(BaseModel):
    congestion_risk_pct: int
    contributing_factors: list[ContributingFactor]
    confidence_pct: int
    explanation_method: Literal["rule_based_heuristic", "shap_tree_explainer"]


# ── Feature 2: Event Impact Simulator ──────────────────────────────────
class SimulateEventRequest(BaseModel):
    event_type: Literal["political_rally", "concert", "cricket_match", "road_closure"]
    zone: str
    expected_attendance: Optional[int] = Field(default=None, ge=0)
    duration_hours: Optional[float] = Field(default=None, ge=0)


class SimulateEventResponse(BaseModel):
    event_type: str
    event_label: str
    zone: str
    expected_congestion_increase_pct: int
    baseline_congestion_pct: int
    projected_congestion_pct: int
    affected_zones: list[str]
    recommended_officers: int
    recommended_barricades: int
    duration_hours: Optional[float] = None
    basis: str


# ── Feature 3: What-If Analysis ────────────────────────────────────────
class WhatIfRequest(BaseModel):
    corridor: str
    closure_duration_hours: Optional[float] = Field(default=None, ge=0)


class AlternativeRoute(BaseModel):
    corridor: str
    expected_load_increase_pct: float


class WhatIfResponse(BaseModel):
    closed_corridor: str
    closure_duration_hours: Optional[float] = None
    new_congestion_estimate_pct: int
    traffic_increase_pct: float
    alternative_routes: list[AlternativeRoute]
    basis: str


# ── Feature 6: Executive Command Center ────────────────────────────────
class CommandCenterResponse(BaseModel):
    active_incidents: int
    predicted_hotspots: int
    officers_available: int
    officers_total: int
    emergency_routes_active: int
    advisories_generated: int
    generated_at: str


# ── Feature 7: Demo Data Generator ─────────────────────────────────────
class DemoDataRequest(BaseModel):
    accidents: int = Field(default=4, ge=0, le=30)
    roadblocks: int = Field(default=3, ge=0, le=30)
    congestion_spikes: int = Field(default=4, ge=0, le=30)
    emergency_calls: int = Field(default=2, ge=0, le=30)


class DemoDataResponse(BaseModel):
    generated_at: str
    total_created: int
    breakdown: dict
    incidents: dict
