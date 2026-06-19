"""create incident and citizen report tables (PostGIS-optional)

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-17

Creates incident_types (reference data), incidents, and citizen_reports.

PostGIS is used when available (production Postgres on Render/Supabase).
When PostGIS is not installed (local dev), the `location` column falls back
to plain Text and the GIST index is skipped — lat/lon Float columns cover
all current query needs.
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _postgis_available() -> bool:
    conn = op.get_bind()
    row = conn.execute(sa.text(
        "SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'"
    )).fetchone()
    return bool(row)


def upgrade() -> None:
    use_postgis = _postgis_available()

    if use_postgis:
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        from geoalchemy2 import Geography
        loc_type = Geography(geometry_type="POINT", srid=4326)
    else:
        loc_type = sa.Text  # nullable; lat/lon floats carry all query load locally

    op.create_table(
        "incident_types",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("label", sa.String(100), nullable=False),
    )

    op.create_table(
        "incidents",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("reporter_id", sa.Uuid, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("event_cause", sa.String(50), nullable=False),
        sa.Column("location", loc_type, nullable=True),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("address", sa.String(255), nullable=False),
        sa.Column("corridor", sa.String(100), nullable=True),
        sa.Column("zone", sa.String(100), nullable=True),
        sa.Column("police_station", sa.String(100), nullable=True),
        sa.Column("priority", sa.String(10), nullable=False, server_default="High"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("requires_road_closure", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("confirmation_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("severity_score", sa.SmallInteger, nullable=True),
        sa.Column("start_datetime", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    if use_postgis:
        op.create_index("idx_incidents_location", "incidents", ["location"], postgresql_using="gist", if_not_exists=True)
    op.create_index("idx_incidents_lat_lon", "incidents", ["latitude", "longitude"], if_not_exists=True)
    op.create_index("ix_incidents_status_start", "incidents", ["status", "start_datetime"], if_not_exists=True)

    op.create_table(
        "citizen_reports",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("reporter_id", sa.Uuid, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tracking_id", sa.String(20), nullable=False, unique=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("address", sa.String(255), nullable=False),
        sa.Column("location", loc_type, nullable=True),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("photo_url", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("resolved_incident_id", sa.Uuid, sa.ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("verified_by_id", sa.Uuid, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_citizen_reports_tracking_id", "citizen_reports", ["tracking_id"], if_not_exists=True)
    op.create_index("ix_citizen_reports_status", "citizen_reports", ["status"], if_not_exists=True)

    incident_types_table = sa.table(
        "incident_types", sa.column("id", sa.Integer), sa.column("code", sa.String), sa.column("label", sa.String)
    )
    seed_types = [
        ("accident", "Accident"), ("water_logging", "Waterlogging"), ("tree_fall", "Tree Fall"),
        ("vehicle_breakdown", "Vehicle Breakdown"), ("public_event", "Public Event"),
        ("signal_failure", "Signal Failure"), ("pot_holes", "Pothole"), ("construction", "Construction"),
        ("obstruction", "Obstruction"), ("others", "Others"),
    ]
    op.bulk_insert(incident_types_table, [
        {"id": i + 1, "code": code, "label": label} for i, (code, label) in enumerate(seed_types)
    ])


def downgrade() -> None:
    op.drop_table("citizen_reports")
    op.drop_table("incidents")
    op.drop_table("incident_types")
