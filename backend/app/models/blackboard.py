import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.session import Base

class Blackboard(Base):
    __tablename__ = "blackboards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    
    # Store the drawing data (JSON from tldraw/excalidraw)
    data = Column(JSONB, nullable=False, default={})
    
    # Path to a generated preview image (useful for comments/previews)
    preview_image = Column(String, nullable=True)
    
    # Association
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", backref="blackboards")
    task = relationship("Task", backref="blackboards")
    owner = relationship("User", backref="blackboards")
