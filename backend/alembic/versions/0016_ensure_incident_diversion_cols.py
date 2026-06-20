"""ensure road_status and affected_road columns exist on incidents

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-20

Compensating migration: migration 0006_add_diversion_cols_to_incidents was
recorded in alembic_version as "0006" on some deployments where the old
seed migration (before renumbering) had already claimed that revision ID.
Alembic therefore skipped 0006 on those deployments, leaving road_status
and affected_road missing.  Uses IF NOT EXISTS so this is safe to run
regardless of the actual column state.
"""
import sqlalchemy as sa
from alembic import op

revision      = "0016"
down_revision = "0015"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS road_status  VARCHAR(32)"
    ))
    conn.execute(sa.text(
        "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS affected_road TEXT"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE incidents DROP COLUMN IF EXISTS affected_road"))
    conn.execute(sa.text("ALTER TABLE incidents DROP COLUMN IF EXISTS road_status"))
