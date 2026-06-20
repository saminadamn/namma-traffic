"""
SQLAlchemy ORM models for incident reporting and management (Priority 2).

THREE design decisions worth reading before extending this file:

1. Every point is stored TWICE: once as a PostGIS `Geography` column
   (`location`) and once as plain `latitude`/`longitude` Float columns.
   This is a deliberate denormalization, not an oversight. `location`
   exists so dedup-check and future "nearby search" can run accurate
   great-circle radius queries (ST_DWithin) backed by a GIST index.
   `latitude`/`longitude` exist so every list/read endpoint can return
   flat JSON in exactly the shape the frontend already expects
   (frontend/lib/api.ts: Incident.latitude / Incident.longitude) without
   parsing WKB on every request. Both are always written together in
   services/incident_service.py — never one without the other.

2. Map-viewport ("what's in my bounding box") queries use the plain
   latitude/longitude columns with simple range filters, NOT PostGIS
   ST_MakeEnvelope/ST_Intersects. A map viewport is an axis-aligned
   rectangle in lat/lon with no antimeridian-crossing edge case to get
   right for a Bengaluru-only deployment — the simpler query is also the
   more obviously correct one. PostGIS geography functions are reserved
   for radius search and dedup-check, where meter-accurate circular
   distance actually matters. See services/incident_service.py.

3. `Incident.event_cause` is a plain string, NOT a hard foreign key into
   `incident_types`, even though that lookup table exists. The existing
   frontend (frontend/app/citizen/report/page.tsx) already sends
   free-form category strings from a hard-coded UI list that doesn't
   perfectly match any fixed backend enum yet. A hard FK constraint
   would reject the very first report submitted with a category not
   already seeded — exactly the kind of self-inflicted production
   incident this PR is supposed to prevent, not cause. `incident_types`
   is a governance/reference table for now; tightening it into a real
   constraint is a follow-up once the category list is stable.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, SmallInteger, String, Text, Uuid, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class IncidentType(Base):
    """Reference/lookup table of known incident categories — informational,
    not enforced as a hard FK. See module docstring point (3)."""
    __tablename__ = "incident_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_cause: Mapped[str] = mapped_column(String(50), nullable=False)

    location: Mapped[str | None] = mapped_column(String, nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    address: Mapped[str] = mapped_column(String(255), nullable=False)
    corridor: Mapped[str | None] = mapped_column(String(100), nullable=True)
    zone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    police_station: Mapped[str | None] = mapped_column(String(100), nullable=True)

    priority: Mapped[str] = mapped_column(String(10), default="High", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    requires_road_closure: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Bumped by services.incident_service.find_duplicate_incident() instead
    # of creating a new row when several citizens report the same thing.
    confirmation_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    severity_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    closure_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    priority_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Written back by the Diversion Planning Engine after POST /diversion/plan
    road_status:   Mapped[str | None] = mapped_column(String(32), nullable=True)
    affected_road: Mapped[str | None] = mapped_column(Text, nullable=True)

    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    reports: Mapped[list["CitizenReport"]] = relationship(back_populates="resolved_incident")


class CitizenReport(Base):
    __tablename__ = "citizen_reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    tracking_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    address: Mapped[str] = mapped_column(String(255), nullable=False)

    location: Mapped[str | None] = mapped_column(String, nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)

    # Collected from citizen at submission time — used for accurate ML scoring.
    veh_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    incident_type: Mapped[str | None] = mapped_column(String(20), nullable=True, default="unplanned")

    # ML scoring — populated by the geocode_report ARQ worker after submission.
    # NULL until the worker runs; authority queue sorts by risk_score DESC NULLS LAST.
    closure_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    priority_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    risk_band: Mapped[str | None] = mapped_column(String(20), nullable=True)

    resolved_incident_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True
    )
    resolved_incident: Mapped["Incident"] = relationship(back_populates="reports")

    authenticated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    verified_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
