"""seed default admin user

Revision ID: 0011
Revises: 0006
Create Date: 2026-06-19

Seeds one super_admin account so the authority dashboard can be accessed
immediately after deployment without needing a separate registration step.

Credentials (change after first login):
  Phone : 9000000000
  Password: Admin@1234
"""
import uuid

import sqlalchemy as sa
from alembic import op
from passlib.context import CryptContext

revision = "0011"
down_revision = "0006"
branch_labels = None
depends_on = None

_PHONE = "9000000000"
_PASSWORD = "Admin@1234"
_FULL_NAME = "Admin User"
_SUPER_ADMIN_ROLE_ID = 5   # matches ROLES order in 0001


def upgrade() -> None:
    bind = op.get_bind()
    exists = bind.execute(
        sa.text("SELECT 1 FROM users WHERE phone_number = :ph"),
        {"ph": _PHONE},
    ).fetchone()
    if exists:
        return

    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user_id = uuid.uuid4()

    users = sa.table(
        "users",
        sa.column("id", sa.Uuid),
        sa.column("phone_number", sa.String),
        sa.column("full_name", sa.String),
        sa.column("password_hash", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    user_roles = sa.table(
        "user_roles",
        sa.column("user_id", sa.Uuid),
        sa.column("role_id", sa.Integer),
    )

    op.bulk_insert(users, [{
        "id": user_id,
        "phone_number": _PHONE,
        "full_name": _FULL_NAME,
        "password_hash": pwd.hash(_PASSWORD),
        "is_active": True,
    }])
    op.bulk_insert(user_roles, [{"user_id": user_id, "role_id": _SUPER_ADMIN_ROLE_ID}])


def downgrade() -> None:
    op.execute(f"DELETE FROM users WHERE phone_number = '{_PHONE}'")
