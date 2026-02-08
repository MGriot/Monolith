import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.core.enums import IdeaStatus

class Idea(Base):
    __tablename__ = "ideas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    status = Column(SAEnum(IdeaStatus), default=IdeaStatus.PROPOSED)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # If promoted to task, store the task ID
    converted_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="ideas")
    author = relationship("User", foreign_keys=[author_id])
    converted_task = relationship("Task", foreign_keys=[converted_task_id])
    comments = relationship("IdeaComment", back_populates="idea", cascade="all, delete-orphan")

