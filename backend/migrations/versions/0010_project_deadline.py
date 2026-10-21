"""Projects: hard deadline

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('deadline_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'deadline_at')
