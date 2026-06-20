"""seed demo traffic_personnel user

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-20

Adds a demo account with the traffic_personnel role so the traffic
login page has working credentials that actually trigger auto-approval.

Demo credentials:
  Phone   : 9333333333
  Password: Traffic@1234
"""
import uuid

import sqlalchemy as sa
from alembic import op
from passlib.context import CryptContext

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

_PHONE    = "9333333333"
_PASSWORD = "Traffic@1234"
_NAME     = "Demo Traffic Personnel"
_ROLE_ID  = 6   # traffic_personnel — seeded by 0009


def upgrade() -> None:
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    bind = op.get_bind()

    exists = bind.execute(
        sa.text("SELECT 1 FROM users WHERE phone_number = :ph"), {"ph": _PHONE}
    ).fetchone()
    if exists:
        return

    user_id = uuid.uuid4()
    users = sa.table(
        "users",
        sa.column("id",            sa.Uuid),
        sa.column("phone_number",  sa.String),
        sa.column("full_name",     sa.String),
        sa.column("password_hash", sa.String),
        sa.column("is_active",     sa.Boolean),
    )
    user_roles = sa.table(
        "user_roles",
        sa.column("user_id",  sa.Uuid),
        sa.column("role_id",  sa.Integer),
    )

    op.bulk_insert(users, [{
        "id":            user_id,
        "phone_number":  _PHONE,
        "full_name":     _NAME,
        "password_hash": pwd.hash(_PASSWORD),
        "is_active":     True,
    }])
    op.bulk_insert(user_roles, [{"user_id": user_id, "role_id": _ROLE_ID}])


def downgrade() -> None:
    op.execute(f"DELETE FROM users WHERE phone_number = '{_PHONE}'")
