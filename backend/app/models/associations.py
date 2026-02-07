from sqlalchemy import Column, ForeignKey, Table
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
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
)
