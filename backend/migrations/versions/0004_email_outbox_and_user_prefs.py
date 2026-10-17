"""email outbox, scheduler job runs, user e-mail preferences

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'email_outbox',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('to_email', sa.String(), nullable=False),
        sa.Column('subject', sa.String(), nullable=False),
        sa.Column('body_text', sa.Text(), nullable=False),
        sa.Column('body_html', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('next_attempt_at', sa.DateTime(), nullable=False),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_email_outbox_kind'), 'email_outbox', ['kind'], unique=False)
    op.create_index('ix_email_outbox_due', 'email_outbox', ['status', 'next_attempt_at'], unique=False)

    op.create_table(
        'job_runs',
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('last_run_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('name'),
    )

    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(), nullable=True))
    # server_default fills existing rows: everybody keeps receiving what they received before
    op.add_column('users', sa.Column('notify_email_assignments', sa.Boolean(), server_default=sa.true(), nullable=False))
    op.add_column('users', sa.Column('notify_email_digest', sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'notify_email_digest')
    op.drop_column('users', 'notify_email_assignments')
    op.drop_column('users', 'email_verified_at')
    op.drop_table('job_runs')
    op.drop_index('ix_email_outbox_due', table_name='email_outbox')
    op.drop_index(op.f('ix_email_outbox_kind'), table_name='email_outbox')
    op.drop_table('email_outbox')
