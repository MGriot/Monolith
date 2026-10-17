"""project member roles (viewer / editor / admin)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Every existing member keeps exactly the rights they had: "editor" is what a member could always do.
    op.add_column('project_members', sa.Column('role', sa.String(), server_default='editor', nullable=False))
    op.create_check_constraint('ck_project_members_role', 'project_members', "role IN ('viewer', 'editor', 'admin')")


def downgrade() -> None:
    op.drop_constraint('ck_project_members_role', 'project_members', type_='check')
    op.drop_column('project_members', 'role')
