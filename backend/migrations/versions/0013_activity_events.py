"""Task change log: who changed what, per project

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0013'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'activity_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('task_title', sa.String(), nullable=True),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('actor_label', sa.String(), nullable=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('changes', postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_activity_events_project_created', 'activity_events', ['project_id', 'created_at'])
    op.create_index('ix_activity_events_task_id', 'activity_events', ['task_id'])


def downgrade() -> None:
    op.drop_index('ix_activity_events_task_id', table_name='activity_events')
    op.drop_index('ix_activity_events_project_created', table_name='activity_events')
    op.drop_table('activity_events')
