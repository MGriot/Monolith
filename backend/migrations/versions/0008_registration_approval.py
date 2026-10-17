"""admin-approved sign-up: approval_status and must_change_password on users

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('approval_status', sa.String(), nullable=False, server_default='approved'))
    op.add_column('users', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('users', 'must_change_password')
    op.drop_column('users', 'approval_status')
