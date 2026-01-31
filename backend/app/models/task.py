import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Table, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.core.enums import Status, Priority

# Association Tables
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

task_dependencies = Table(
    "task_dependencies",
    Base.metadata,
    Column("blocker_id", UUID(as_uuid=True), ForeignKey("tasks.id"), primary_key=True),
    Column("blocked_id", UUID(as_uuid=True), ForeignKey("tasks.id"), primary_key=True)
)

class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    topic = Column(String, index=True)
    type = Column(String, index=True)
    
    status = Column(SAEnum(Status), default=Status.TODO)
    priority = Column(SAEnum(Priority), default=Priority.MEDIUM)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    start_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    tags = Column(ARRAY(String), default=[])
    attachments = Column(ARRAY(String), default=[]) # File URLs
    
    # Relationships
    project = relationship("Project", back_populates="tasks")
    subtasks = relationship("Subtask", back_populates="task", cascade="all, delete-orphan")
    owner = relationship("User", foreign_keys=[owner_id])
    assignees = relationship("User", secondary=task_assignees, backref="assigned_tasks")
    
    # Dependencies: blocked_tasks (tasks blocked by this one), blocking_tasks (tasks blocking this one)
    blocked_tasks = relationship(
        "Task",
        secondary=task_dependencies,
        primaryjoin=id==task_dependencies.c.blocker_id,
        secondaryjoin=id==task_dependencies.c.blocked_id,
        backref="blocking_tasks"
    )

class Subtask(Base):
    __tablename__ = "subtasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    topic = Column(String, index=True)
    type = Column(String, index=True)
    
    status = Column(SAEnum(Status), default=Status.TODO)
    priority = Column(SAEnum(Priority), default=Priority.MEDIUM)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    start_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    tags = Column(ARRAY(String), default=[])
    attachments = Column(ARRAY(String), default=[])
    
    # Relationships
    task = relationship("Task", back_populates="subtasks")
    owner = relationship("User", foreign_keys=[owner_id])
    assignees = relationship("User", secondary=subtask_assignees, backref="assigned_subtasks")
