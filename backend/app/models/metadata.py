import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

class Topic(Base):
    __tablename__ = "topics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, index=True, nullable=False)
    color = Column(String, default="#64748b") # Default slate-500
    is_active = Column(Boolean, default=True)
    
    # Scoping
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)

    # Relationships
    project = relationship("Project", back_populates="topics_scoped", foreign_keys=[project_id])
    task = relationship("Task", back_populates="topics_scoped", foreign_keys=[task_id])

    # One name per scope (migration 0014). Partial indexes, because a plain UNIQUE(name, project_id, task_id)
    # treats NULL scope columns as distinct and would allow duplicate global or project names.
    __table_args__ = (
        Index('topics_global_unique_idx', 'name', unique=True,
              postgresql_where=text('project_id IS NULL AND task_id IS NULL')),
        Index('topics_project_unique_idx', 'name', 'project_id', unique=True,
              postgresql_where=text('project_id IS NOT NULL')),
        Index('topics_task_unique_idx', 'name', 'task_id', unique=True,
              postgresql_where=text('task_id IS NOT NULL')),
    )

class WorkType(Base):
    __tablename__ = "work_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, index=True, nullable=False)
    color = Column(String, default="#64748b")
    icon = Column(String, nullable=True) # Icon identifier for Lucide/Shadcn
    is_active = Column(Boolean, default=True)

    # Scoping
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)

    # Relationships
    project = relationship("Project", back_populates="work_types_scoped", foreign_keys=[project_id])
    task = relationship("Task", back_populates="work_types_scoped", foreign_keys=[task_id])

    # One name per scope (migration 0014). Partial indexes, because a plain UNIQUE(name, project_id, task_id)
    # treats NULL scope columns as distinct and would allow duplicate global or project names.
    __table_args__ = (
        Index('work_types_global_unique_idx', 'name', unique=True,
              postgresql_where=text('project_id IS NULL AND task_id IS NULL')),
        Index('work_types_project_unique_idx', 'name', 'project_id', unique=True,
              postgresql_where=text('project_id IS NOT NULL')),
        Index('work_types_task_unique_idx', 'name', 'task_id', unique=True,
              postgresql_where=text('task_id IS NOT NULL')),
    )
