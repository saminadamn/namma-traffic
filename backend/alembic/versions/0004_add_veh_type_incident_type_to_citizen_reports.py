"""add veh_type and incident_type to citizen_reports

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-20

Citizen reports now collect vehicle type and incident classification
(planned/unplanned) so the ARQ worker can pass them to CatBoost scoring
instead of defaulting to None/unplanned on every report.
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("citizen_reports", sa.Column("veh_type", sa.String(50), nullable=True))
    op.add_column("citizen_reports", sa.Column("incident_type", sa.String(20), nullable=True, server_default="unplanned"))


def downgrade() -> None:
    op.drop_column("citizen_reports", "incident_type")
    op.drop_column("citizen_reports", "veh_type")
