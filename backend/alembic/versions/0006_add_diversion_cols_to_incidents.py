"""add road_status and affected_road columns to incidents

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-20

Written back by the Diversion Planning Engine after generating a plan for
an incident. NULL until the first POST /diversion/plan call for that incident.
"""
import sqlalchemy as sa
from alembic import op

revision      = "0006"
down_revision = "0005"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS road_status  VARCHAR(32)"))
    conn.execute(sa.text("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS affected_road TEXT"))


def downgrade() -> None:
    op.drop_column("incidents", "affected_road")
    op.drop_column("incidents", "road_status")
