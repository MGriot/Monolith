"""Personal MCP access tokens

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0011'
down_revision: Union[str, None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mcp_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('token_prefix', sa.String(), nullable=False),
        sa.Column('token_hash', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_mcp_tokens_user_id', 'mcp_tokens', ['user_id'])
    op.create_index('ix_mcp_tokens_token_hash', 'mcp_tokens', ['token_hash'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_mcp_tokens_token_hash', table_name='mcp_tokens')
    op.drop_index('ix_mcp_tokens_user_id', table_name='mcp_tokens')
    op.drop_table('mcp_tokens')
