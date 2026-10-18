"""File Hub: topics as tags on files

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'file_topics',
        sa.Column('file_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('files.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('topic_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('topics.id', ondelete='CASCADE'), primary_key=True),
    )
    op.create_index('ix_file_topics_topic_id', 'file_topics', ['topic_id'])


def downgrade() -> None:
    op.drop_index('ix_file_topics_topic_id', table_name='file_topics')
    op.drop_table('file_topics')
