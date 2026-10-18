from sqlalchemy import CheckConstraint, Column, ForeignKey, String, Table
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base

project_topics = Table(
    "project_topics",
    Base.metadata,
    Column("project_id", UUID(as_uuid=True), ForeignKey("projects.id"), primary_key=True),
    Column("topic_id", UUID(as_uuid=True), ForeignKey("topics.id"), primary_key=True)
)

project_types = Table(
    "project_types",
    Base.metadata,
    Column("project_id", UUID(as_uuid=True), ForeignKey("projects.id"), primary_key=True),
    Column("type_id", UUID(as_uuid=True), ForeignKey("work_types.id"), primary_key=True)
)

task_topics = Table(
    "task_topics",
    Base.metadata,
    Column("task_id", UUID(as_uuid=True), ForeignKey("tasks.id"), primary_key=True),
    Column("topic_id", UUID(as_uuid=True), ForeignKey("topics.id"), primary_key=True)
)

task_types = Table(
    "task_types",
    Base.metadata,
    Column("task_id", UUID(as_uuid=True), ForeignKey("tasks.id"), primary_key=True),
    Column("type_id", UUID(as_uuid=True), ForeignKey("work_types.id"), primary_key=True)
)

project_members = Table(
    "project_members",
    Base.metadata,
    Column("project_id", UUID(as_uuid=True), ForeignKey("projects.id"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True),
    # viewer (read-only) | editor (work on tasks, the role every member had before roles existed) | admin (settings, members)
    Column("role", String, nullable=False, server_default="editor"),
    CheckConstraint("role IN ('viewer', 'editor', 'admin')", name="ck_project_members_role"),
)

task_assignees = Table(
    "task_assignees",
    Base.metadata,
    Column("task_id", UUID(as_uuid=True), ForeignKey("tasks.id"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
)

subtask_assignees = Table(
    "subtask_assignees",
    Base.metadata,
    Column("subtask_id", UUID(as_uuid=True), ForeignKey("subtasks.id"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
)

team_members = Table(
    "team_members",
    Base.metadata,
    Column("team_id", UUID(as_uuid=True), ForeignKey("teams.id"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
)

template_shares = Table(
    "template_shares",
    Base.metadata,
    Column("template_id", UUID(as_uuid=True), ForeignKey("project_templates.id"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
)

team_shares = Table(
    "team_shares",
    Base.metadata,
    Column("team_id", UUID(as_uuid=True), ForeignKey("teams.id"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
)

workflow_shares = Table(
    "workflow_shares",
    Base.metadata,
    Column("workflow_id", UUID(as_uuid=True), ForeignKey("workflows.id"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
)

idea_votes = Table(
    "idea_votes",
    Base.metadata,
    Column("idea_id", UUID(as_uuid=True), ForeignKey("ideas.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
)

idea_downvotes = Table(
    "idea_downvotes",
    Base.metadata,
    Column("idea_id", UUID(as_uuid=True), ForeignKey("ideas.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
)


# Topics used as tags on File Hub files; rows go with either side.
file_topics = Table(
    "file_topics",
    Base.metadata,
    Column("file_id", UUID(as_uuid=True), ForeignKey("files.id", ondelete="CASCADE"), primary_key=True),
    Column("topic_id", UUID(as_uuid=True), ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True),
)
