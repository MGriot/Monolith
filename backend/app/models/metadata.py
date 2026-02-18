import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, UniqueConstraint
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

    __table_args__ = (
        UniqueConstraint('name', 'project_id', 'task_id', name='_topic_name_scope_uc'),
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

    __table_args__ = (
        UniqueConstraint('name', 'project_id', 'task_id', name='_work_type_name_scope_uc'),
    )
