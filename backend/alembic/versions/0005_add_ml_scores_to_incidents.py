"""add ML closure/priority scores to incidents table

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-20

Stores CatBoost output on incidents so the priority ranking widget can
incorporate ML closure probability instead of relying solely on the
rule-based severity_score. NULL for incidents created before this migration.
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("incidents", sa.Column("closure_probability", sa.Float, nullable=True))
    op.add_column("incidents", sa.Column("priority_probability", sa.Float, nullable=True))


def downgrade() -> None:
    op.drop_column("incidents", "priority_probability")
    op.drop_column("incidents", "closure_probability")
