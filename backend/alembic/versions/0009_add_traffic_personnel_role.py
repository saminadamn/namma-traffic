"""add traffic_personnel role and authenticated flag on citizen_reports

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-20

Traffic personnel are government-recognised field reporters. Their reports
are auto-approved (no manual control-room verification needed). This
migration:
  1. Inserts the traffic_personnel role (id=6).
  2. Grants it the same report/incident read-create permissions as citizen.
  3. Adds an `authenticated` boolean column to citizen_reports so the DB
     permanently records which reports originated from a verified source.
"""
import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

_ROLE_NAME = "traffic_personnel"
_ROLE_ID = 6
_PERM_CODES = ["incident:create", "incident:read", "report:create", "report:read"]


def upgrade() -> None:
    conn = op.get_bind()

    existing = conn.execute(
        sa.text("SELECT 1 FROM roles WHERE name = :n"), {"n": _ROLE_NAME}
    ).fetchone()
    if not existing:
        conn.execute(
            sa.text("INSERT INTO roles (id, name) VALUES (:id, :name)"),
            {"id": _ROLE_ID, "name": _ROLE_NAME},
        )
        for code in _PERM_CODES:
            conn.execute(
                sa.text("""
                    INSERT INTO role_permissions (role_id, permission_id)
                    SELECT :rid, id FROM permissions WHERE code = :code
                    ON CONFLICT DO NOTHING
                """),
                {"rid": _ROLE_ID, "code": code},
            )

    conn.execute(sa.text(
        "ALTER TABLE citizen_reports "
        "ADD COLUMN IF NOT EXISTS authenticated BOOLEAN NOT NULL DEFAULT FALSE"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE citizen_reports DROP COLUMN IF EXISTS authenticated"))
    conn.execute(sa.text("DELETE FROM role_permissions WHERE role_id = :rid"), {"rid": _ROLE_ID})
    conn.execute(sa.text("DELETE FROM roles WHERE id = :rid"), {"rid": _ROLE_ID})
