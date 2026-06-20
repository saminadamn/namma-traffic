"""add ML scoring columns to citizen_reports

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-20

Adds four nullable columns so the background worker can store CatBoost +
Business Rules Engine scores on pending citizen reports. Authorities can
then sort the review queue by risk_score DESC instead of FIFO, prioritising
reports most likely to need road closure.
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("citizen_reports", sa.Column("closure_probability", sa.Float, nullable=True))
    op.add_column("citizen_reports", sa.Column("priority_probability", sa.Float, nullable=True))
    op.add_column("citizen_reports", sa.Column("risk_score", sa.SmallInteger, nullable=True))
    op.add_column("citizen_reports", sa.Column("risk_band", sa.String(20), nullable=True))
    op.create_index(
        "ix_citizen_reports_risk_score",
        "citizen_reports",
        ["risk_score"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_citizen_reports_risk_score", table_name="citizen_reports")
    op.drop_column("citizen_reports", "risk_band")
    op.drop_column("citizen_reports", "risk_score")
    op.drop_column("citizen_reports", "priority_probability")
    op.drop_column("citizen_reports", "closure_probability")
