import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, backref
from app.db.session import Base

class Whiteboard(Base):
    __tablename__ = "whiteboards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    
    # Store the drawing data (JSON from excalidraw)
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
    # Deleting a project deletes its sketches (project_id is NOT NULL); deleting a task only unlinks them.
    project = relationship("Project", backref=backref("whiteboards", cascade="all, delete-orphan"))
    task = relationship("Task", backref="whiteboards")
    owner = relationship("User", backref="whiteboards")
