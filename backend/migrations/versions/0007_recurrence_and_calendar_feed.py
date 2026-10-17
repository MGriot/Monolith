"""recurring tasks and the personal calendar feed token

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('recurrence_rule', sa.String(), nullable=True))
    op.add_column('users', sa.Column('calendar_token', sa.String(), nullable=True))
    op.create_index(op.f('ix_users_calendar_token'), 'users', ['calendar_token'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_calendar_token'), table_name='users')
    op.drop_column('users', 'calendar_token')
    op.drop_column('tasks', 'recurrence_rule')
