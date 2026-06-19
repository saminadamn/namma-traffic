"""create auth, rbac, and audit tables

Revision ID: 0001
Revises:
Create Date: 2026-06-17

Seeds 5 roles and the permission codes needed now (Priority 1-2) plus a
couple of permission codes forward-declared for features not yet built
(emergency:dispatch for Priority 5, advisory:generate for Priority 6).
Pre-provisioning those codes means assigning them to a role later is a
data change, not a second schema migration.
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

ROLES = ["citizen", "field_officer", "control_room_operator", "emergency_dispatcher", "super_admin"]

PERMISSIONS = [
    "incident:create", "incident:read", "incident:verify", "incident:resolve",
    "report:create", "report:read", "report:verify",
    "prediction:run", "prediction:admin",
    "analytics:read",
    "user:list", "user:manage", "role:assign",
    "emergency:dispatch",     # pre-provisioned for Priority 5
    "advisory:generate",      # pre-provisioned for Priority 6
]

ROLE_PERMISSION_MAP = {
    "citizen": ["incident:create", "report:create", "report:read"],
    "field_officer": [
        "incident:create", "incident:read", "incident:verify", "incident:resolve",
        "report:read", "report:verify",
    ],
    "control_room_operator": [
        "incident:read", "incident:verify", "incident:resolve",
        "report:read", "report:verify", "prediction:run", "analytics:read",
    ],
    "emergency_dispatcher": ["incident:read", "prediction:run", "analytics:read", "emergency:dispatch"],
    "super_admin": PERMISSIONS,  # explicit full grant, not a wildcard — stays auditable in role_permissions
}


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
    )
    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(100), nullable=False, unique=True),
    )
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer, sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", sa.Integer, sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("phone_number", sa.String(15), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=True, unique=True),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_phone_number", "users", ["phone_number"])
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", sa.Integer, sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("user_id", sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Uuid, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource", sa.String(100), nullable=True),
        sa.Column("extra", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Seed roles, permissions, and the role -> permission mapping ────
    roles_table = sa.table("roles", sa.column("id", sa.Integer), sa.column("name", sa.String))
    permissions_table = sa.table("permissions", sa.column("id", sa.Integer), sa.column("code", sa.String))
    role_permissions_table = sa.table(
        "role_permissions", sa.column("role_id", sa.Integer), sa.column("permission_id", sa.Integer)
    )

    op.bulk_insert(roles_table, [{"id": i + 1, "name": name} for i, name in enumerate(ROLES)])
    op.bulk_insert(permissions_table, [{"id": i + 1, "code": code} for i, code in enumerate(PERMISSIONS)])

    role_id_by_name = {name: i + 1 for i, name in enumerate(ROLES)}
    perm_id_by_code = {code: i + 1 for i, code in enumerate(PERMISSIONS)}

    mapping_rows = []
    for role_name, perm_codes in ROLE_PERMISSION_MAP.items():
        for code in perm_codes:
            mapping_rows.append({
                "role_id": role_id_by_name[role_name],
                "permission_id": perm_id_by_code[code],
            })
    op.bulk_insert(role_permissions_table, mapping_rows)


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("refresh_tokens")
    op.drop_table("user_roles")
    op.drop_table("users")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
