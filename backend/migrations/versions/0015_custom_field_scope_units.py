"""Custom fields on projects, global definitions, units and number limits

- custom_field_defs.project_id becomes nullable: NULL is a global definition every project gets.
- custom_field_defs.applies_to ('project' | 'task', existing rows 'task') says which table holds the values.
- unit / currency / min_value / max_value / decimals describe number and currency fields.
- projects.custom_values holds project field values, like tasks.custom_values.
- The unique (project_id, name) index becomes one partial index per scope, also keyed by applies_to.

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TYPES = "('currency', 'checkbox', 'url')"


def upgrade() -> None:
    op.add_column('custom_field_defs', sa.Column('applies_to', sa.String(), server_default='task', nullable=False))
    op.add_column('custom_field_defs', sa.Column('unit', sa.String(length=32), nullable=True))
    op.add_column('custom_field_defs', sa.Column('currency', sa.String(length=3), nullable=True))
    op.add_column('custom_field_defs', sa.Column('min_value', sa.Float(), nullable=True))
    op.add_column('custom_field_defs', sa.Column('max_value', sa.Float(), nullable=True))
    op.add_column('custom_field_defs', sa.Column('decimals', sa.SmallInteger(), nullable=True))
    op.alter_column('custom_field_defs', 'project_id', existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.create_check_constraint('ck_custom_field_defs_applies_to', 'custom_field_defs', "applies_to IN ('project', 'task')")

    op.drop_index('uq_custom_field_defs_project_name', table_name='custom_field_defs')
    op.create_index('uq_custom_field_defs_project_name', 'custom_field_defs', ['project_id', 'applies_to', 'name'],
                    unique=True, postgresql_where=sa.text('project_id IS NOT NULL'))
    op.create_index('uq_custom_field_defs_global_name', 'custom_field_defs', ['applies_to', 'name'],
                    unique=True, postgresql_where=sa.text('project_id IS NULL'))

    op.add_column('projects', sa.Column('custom_values', postgresql.JSONB(astext_type=sa.Text()),
                                        server_default='{}', nullable=False))
    op.create_index('ix_projects_custom_values', 'projects', ['custom_values'], unique=False, postgresql_using='gin')


def downgrade() -> None:
    # Global definitions, project fields and the new types have no place in the old schema: they go, with their values.
    op.drop_index('ix_projects_custom_values', table_name='projects', postgresql_using='gin')
    op.drop_column('projects', 'custom_values')
    gone = f"d.project_id IS NULL OR d.applies_to = 'project' OR d.field_type IN {NEW_TYPES}"
    op.execute(f"""
        UPDATE tasks SET custom_values = tasks.custom_values - d.id::text
        FROM custom_field_defs d WHERE ({gone}) AND jsonb_exists(tasks.custom_values, d.id::text)
    """)
    op.execute(f"DELETE FROM custom_field_defs d WHERE {gone}")

    op.drop_index('uq_custom_field_defs_global_name', table_name='custom_field_defs')
    op.drop_index('uq_custom_field_defs_project_name', table_name='custom_field_defs')
    op.create_index('uq_custom_field_defs_project_name', 'custom_field_defs', ['project_id', 'name'], unique=True)
    op.drop_constraint('ck_custom_field_defs_applies_to', 'custom_field_defs', type_='check')
    op.alter_column('custom_field_defs', 'project_id', existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    for col in ('decimals', 'max_value', 'min_value', 'currency', 'unit', 'applies_to'):
        op.drop_column('custom_field_defs', col)
