"""add secondary indexes (FK lookups, notification bell, task tree, trigram search)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Trigram GIN indexes make ILIKE '%q%' (global search) indexable. Needs the contrib extension;
    # CREATE EXTENSION requires a role that may create it (the bundled postgres image user can).
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_index('ix_dependencies_predecessor_id', 'dependencies', ['predecessor_id'], unique=False)
    op.create_index('ix_dependencies_successor_id', 'dependencies', ['successor_id'], unique=False)
    op.create_index('ix_files_folder_id', 'files', ['folder_id'], unique=False)
    op.create_index('ix_folders_owner_id', 'folders', ['owner_id'], unique=False)
    op.create_index('ix_folders_parent_id', 'folders', ['parent_id'], unique=False)
    op.create_index('ix_folders_project_id', 'folders', ['project_id'], unique=False)
    op.create_index('ix_folders_task_id', 'folders', ['task_id'], unique=False)
    op.create_index('ix_ideas_author_id', 'ideas', ['author_id'], unique=False)
    op.create_index('ix_ideas_description_trgm', 'ideas', ['description'], unique=False, postgresql_using='gin', postgresql_ops={'description': 'gin_trgm_ops'})
    op.create_index('ix_ideas_project_id', 'ideas', ['project_id'], unique=False)
    op.create_index('ix_ideas_title_trgm', 'ideas', ['title'], unique=False, postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.create_index('ix_notifications_user_read_created', 'notifications', ['user_id', 'is_read', sa.literal_column('created_at DESC')], unique=False)
    op.create_index('ix_project_members_user_id', 'project_members', ['user_id'], unique=False)
    op.create_index('ix_projects_description_trgm', 'projects', ['description'], unique=False, postgresql_using='gin', postgresql_ops={'description': 'gin_trgm_ops'})
    op.create_index('ix_projects_is_archived', 'projects', ['is_archived'], unique=False)
    op.create_index('ix_projects_name_trgm', 'projects', ['name'], unique=False, postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'})
    op.create_index('ix_projects_owner_id', 'projects', ['owner_id'], unique=False)
    op.create_index('ix_task_assignees_user_id', 'task_assignees', ['user_id'], unique=False)
    op.create_index('ix_tasks_description_trgm', 'tasks', ['description'], unique=False, postgresql_using='gin', postgresql_ops={'description': 'gin_trgm_ops'})
    op.create_index('ix_tasks_due_date', 'tasks', ['due_date'], unique=False)
    op.create_index('ix_tasks_owner_id', 'tasks', ['owner_id'], unique=False)
    op.create_index('ix_tasks_parent_id', 'tasks', ['parent_id'], unique=False)
    op.create_index('ix_tasks_project_parent_sort', 'tasks', ['project_id', 'parent_id', 'sort_index'], unique=False)
    op.create_index('ix_tasks_title_trgm', 'tasks', ['title'], unique=False, postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.create_index('ix_team_members_user_id', 'team_members', ['user_id'], unique=False)
    op.create_index('ix_webhooks_owner_id', 'webhooks', ['owner_id'], unique=False)
    op.create_index('ix_whiteboards_project_id', 'whiteboards', ['project_id'], unique=False)
    op.create_index('ix_whiteboards_task_id', 'whiteboards', ['task_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_whiteboards_task_id', table_name='whiteboards')
    op.drop_index('ix_whiteboards_project_id', table_name='whiteboards')
    op.drop_index('ix_webhooks_owner_id', table_name='webhooks')
    op.drop_index('ix_team_members_user_id', table_name='team_members')
    op.drop_index('ix_tasks_title_trgm', table_name='tasks', postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.drop_index('ix_tasks_project_parent_sort', table_name='tasks')
    op.drop_index('ix_tasks_parent_id', table_name='tasks')
    op.drop_index('ix_tasks_owner_id', table_name='tasks')
    op.drop_index('ix_tasks_due_date', table_name='tasks')
    op.drop_index('ix_tasks_description_trgm', table_name='tasks', postgresql_using='gin', postgresql_ops={'description': 'gin_trgm_ops'})
    op.drop_index('ix_task_assignees_user_id', table_name='task_assignees')
    op.drop_index('ix_projects_owner_id', table_name='projects')
    op.drop_index('ix_projects_name_trgm', table_name='projects', postgresql_using='gin', postgresql_ops={'name': 'gin_trgm_ops'})
    op.drop_index('ix_projects_is_archived', table_name='projects')
    op.drop_index('ix_projects_description_trgm', table_name='projects', postgresql_using='gin', postgresql_ops={'description': 'gin_trgm_ops'})
    op.drop_index('ix_project_members_user_id', table_name='project_members')
    op.drop_index('ix_notifications_user_read_created', table_name='notifications')
    op.drop_index('ix_ideas_title_trgm', table_name='ideas', postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.drop_index('ix_ideas_project_id', table_name='ideas')
    op.drop_index('ix_ideas_description_trgm', table_name='ideas', postgresql_using='gin', postgresql_ops={'description': 'gin_trgm_ops'})
    op.drop_index('ix_ideas_author_id', table_name='ideas')
    op.drop_index('ix_folders_task_id', table_name='folders')
    op.drop_index('ix_folders_project_id', table_name='folders')
    op.drop_index('ix_folders_parent_id', table_name='folders')
    op.drop_index('ix_folders_owner_id', table_name='folders')
    op.drop_index('ix_files_folder_id', table_name='files')
    op.drop_index('ix_dependencies_successor_id', table_name='dependencies')
    op.drop_index('ix_dependencies_predecessor_id', table_name='dependencies')
