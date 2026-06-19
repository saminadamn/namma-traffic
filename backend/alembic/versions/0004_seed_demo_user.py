"""seed easy demo authority user

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-20

Adds a second super_admin account with easy-to-type credentials for
judges and live demos. The original Admin@1234 account is preserved.

Demo credentials shown on the login page:
  Phone   : 9000000000
  Password: Admin@1234
"""
import uuid

import sqlalchemy as sa
from alembic import op
from passlib.context import CryptContext

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

_PHONE    = "9000000000"   # same as 0003 — just ensure record exists (idempotent)
_NEW_PHONE    = "9111111111"
_NEW_PASSWORD = "Demo@1234"
_NEW_NAME     = "Demo Authority"
_SUPER_ADMIN_ROLE_ID = 5


def upgrade() -> None:
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    bind = op.get_bind()

    # Check if the demo user already exists to stay idempotent
    exists = bind.execute(
        sa.text("SELECT 1 FROM users WHERE phone_number = :ph"),
        {"ph": _NEW_PHONE},
    ).fetchone()
    if exists:
        return

    user_id = uuid.uuid4()
    users = sa.table(
        "users",
        sa.column("id",           sa.Uuid),
        sa.column("phone_number", sa.String),
        sa.column("full_name",    sa.String),
        sa.column("password_hash",sa.String),
        sa.column("is_active",    sa.Boolean),
    )
    user_roles = sa.table(
        "user_roles",
        sa.column("user_id",  sa.Uuid),
        sa.column("role_id",  sa.Integer),
    )

    op.bulk_insert(users, [{
        "id":            user_id,
        "phone_number":  _NEW_PHONE,
        "full_name":     _NEW_NAME,
        "password_hash": pwd.hash(_NEW_PASSWORD),
        "is_active":     True,
    }])
    op.bulk_insert(user_roles, [{"user_id": user_id, "role_id": _SUPER_ADMIN_ROLE_ID}])


def downgrade() -> None:
    op.execute(f"DELETE FROM users WHERE phone_number = '{_NEW_PHONE}'")
