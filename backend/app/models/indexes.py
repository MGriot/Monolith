"""Secondary indexes, declared apart from the models so they can be reviewed in one place.

Importing this module (done by app/models/__init__.py) attaches the Index objects to the tables, so
Alembic autogenerate and `metadata.create_all()` see them. The matching migration is 0002.
"""
from sqlalchemy import Index

from app.models.associations import project_members, task_assignees, team_members
from app.models.dependency import Dependency
from app.models.file import File
from app.models.folder import Folder
from app.models.idea import Idea
from app.models.notification import Notification
from app.models.project import Project
from app.models.task import Task
from app.models.webhook import Webhook
from app.models.whiteboard import Whiteboard

# --- tasks: the project task list / subtree queries filter on project_id + parent_id and sort by sort_index
Index("ix_tasks_project_parent_sort", Task.project_id, Task.parent_id, Task.sort_index)
Index("ix_tasks_parent_id", Task.parent_id)
Index("ix_tasks_owner_id", Task.owner_id)
Index("ix_tasks_due_date", Task.due_date)

# --- dependency graph lookups in both directions
Index("ix_dependencies_successor_id", Dependency.successor_id)
Index("ix_dependencies_predecessor_id", Dependency.predecessor_id)

# --- notification bell: unread count / newest first per user
Index("ix_notifications_user_read_created", Notification.user_id, Notification.is_read, Notification.created_at.desc())

# --- projects
Index("ix_projects_owner_id", Project.owner_id)
Index("ix_projects_is_archived", Project.is_archived)

# --- "my tasks / my projects" go through the association tables by user_id (their PKs lead with the other column)
Index("ix_task_assignees_user_id", task_assignees.c.user_id)
Index("ix_project_members_user_id", project_members.c.user_id)
Index("ix_team_members_user_id", team_members.c.user_id)

# --- foreign keys that are filtered on but were not indexed
Index("ix_ideas_project_id", Idea.project_id)
Index("ix_ideas_author_id", Idea.author_id)
Index("ix_folders_project_id", Folder.project_id)
Index("ix_folders_task_id", Folder.task_id)
Index("ix_folders_parent_id", Folder.parent_id)
Index("ix_folders_owner_id", Folder.owner_id)
Index("ix_files_folder_id", File.folder_id)
Index("ix_whiteboards_project_id", Whiteboard.project_id)
Index("ix_whiteboards_task_id", Whiteboard.task_id)
Index("ix_webhooks_owner_id", Webhook.owner_id)

# --- global search uses ILIKE '%q%' on these columns: trigram GIN indexes make that indexable (needs pg_trgm)
for _table, _cols in (
    (Task, ("title", "description")),
    (Project, ("name", "description")),
    (Idea, ("title", "description")),
):
    for _col in _cols:
        Index(
            f"ix_{_table.__tablename__}_{_col}_trgm",
            getattr(_table, _col),
            postgresql_using="gin",
            postgresql_ops={_col: "gin_trgm_ops"},
        )
