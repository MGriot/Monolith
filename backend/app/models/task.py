import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Table, Enum as SAEnum, Integer, Boolean
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
    parent_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    topic = Column(String, index=True)
    type = Column(String, index=True)
    
    status = Column(SAEnum(Status), default=Status.TODO)
    priority = Column(SAEnum(Priority), default=Priority.MEDIUM)
    
    is_milestone = Column(Boolean, default=False)
    deadline_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    start_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    tags = Column(ARRAY(String), default=[])
    attachments = Column(ARRAY(String), default=[])
    
    # Unified dependency storage
    blocked_by_ids = Column(ARRAY(UUID(as_uuid=True)), default=[])
    sort_index = Column(Integer, default=0)
    
    # Relationships
    project = relationship("Project", back_populates="tasks")
    parent = relationship("Task", remote_side=[id], back_populates="subtasks")
    subtasks = relationship("Task", back_populates="parent", cascade="all, delete-orphan")
    
    owner = relationship("User", foreign_keys=[owner_id])
    assignees = relationship("User", secondary=task_assignees, backref="assigned_tasks")
    
    blocked_by = relationship("Dependency", foreign_keys="Dependency.successor_id", back_populates="successor")
    blocking = relationship("Dependency", foreign_keys="Dependency.predecessor_id", back_populates="predecessor")

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
    
    is_milestone = Column(Boolean, default=False)
    deadline_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    start_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    tags = Column(ARRAY(String), default=[])
    attachments = Column(ARRAY(String), default=[])
    
    # Unified dependency storage
    blocked_by_ids = Column(ARRAY(UUID(as_uuid=True)), default=[])
    sort_index = Column(Integer, default=0)
    
    # Relationships
    task = relationship("Task", foreign_keys=[task_id])
    owner = relationship("User", foreign_keys=[owner_id])
    assignees = relationship("User", secondary=subtask_assignees, backref="assigned_subtasks")
