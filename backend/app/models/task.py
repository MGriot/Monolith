import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Table, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.core.enums import Status, Priority

# Association Tables for Assignees (these are still useful)
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
    attachments = Column(ARRAY(String), default=[])
    
    # Unified dependency storage
    blocked_by_ids = Column(ARRAY(UUID(as_uuid=True)), default=[])
    
    # Relationships
    project = relationship("Project", back_populates="tasks")
    subtasks = relationship("Subtask", back_populates="task", cascade="all, delete-orphan", foreign_keys="Subtask.task_id")
    owner = relationship("User", foreign_keys=[owner_id])
    assignees = relationship("User", secondary=task_assignees, backref="assigned_tasks")

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
    
    # Unified dependency storage
    blocked_by_ids = Column(ARRAY(UUID(as_uuid=True)), default=[])
    
    # Relationships
    task = relationship("Task", back_populates="subtasks", foreign_keys=[task_id])
    owner = relationship("User", foreign_keys=[owner_id])
    assignees = relationship("User", secondary=subtask_assignees, backref="assigned_subtasks")