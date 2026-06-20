"""ensure ML and classification columns exist on citizen_reports

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-20

Compensating migration: the original 0003/0004 slot was claimed by seed-data
migrations on some deployments, so the ML column migrations may not have run.
All ALTER TABLE statements use IF NOT EXISTS so this is safe to run regardless.
"""
import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # From 0003_add_ml_scoring_to_citizen_reports
    conn.execute(sa.text("ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS closure_probability FLOAT"))
    conn.execute(sa.text("ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS priority_probability FLOAT"))
    conn.execute(sa.text("ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS risk_score SMALLINT"))
    conn.execute(sa.text("ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS risk_band VARCHAR(20)"))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_citizen_reports_risk_score ON citizen_reports (risk_score)"
    ))

    # From 0004_add_veh_type_incident_type_to_citizen_reports
    conn.execute(sa.text("ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS veh_type VARCHAR(50)"))
    conn.execute(sa.text(
        "ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS incident_type VARCHAR(20) DEFAULT 'unplanned'"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE citizen_reports DROP COLUMN IF EXISTS incident_type"))
    conn.execute(sa.text("ALTER TABLE citizen_reports DROP COLUMN IF EXISTS veh_type"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_citizen_reports_risk_score"))
    conn.execute(sa.text("ALTER TABLE citizen_reports DROP COLUMN IF EXISTS risk_band"))
    conn.execute(sa.text("ALTER TABLE citizen_reports DROP COLUMN IF EXISTS risk_score"))
    conn.execute(sa.text("ALTER TABLE citizen_reports DROP COLUMN IF EXISTS priority_probability"))
    conn.execute(sa.text("ALTER TABLE citizen_reports DROP COLUMN IF EXISTS closure_probability"))
