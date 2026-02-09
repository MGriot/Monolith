import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Table, Boolean, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.core.enums import Status
from app.models.associations import project_topics, project_types, project_members

class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    
    # Old string fields (to be migrated)
    topic = Column(String, index=True)
    type = Column(String, index=True)
    
    # New FK fields
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    type_id = Column(UUID(as_uuid=True), ForeignKey("work_types.id"), nullable=True)
    
    status = Column(SAEnum(Status), default=Status.TODO)
    progress_percent = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    start_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    tags = Column(ARRAY(String), default=[])
    attachments = Column(ARRAY(String), default=[])
    
    is_archived = Column(Boolean, default=False)
    archived_at = Column(DateTime, nullable=True)
    
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # Relationships
    owner = relationship("User", backref="owned_projects", foreign_keys=[owner_id])
    members = relationship("User", secondary=project_members, backref="member_projects")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    ideas = relationship("Idea", back_populates="project", cascade="all, delete-orphan")
    
    topic_ref = relationship("Topic")
    type_ref = relationship("WorkType")

    topics = relationship("Topic", secondary=project_topics, backref="projects")
    types = relationship("WorkType", secondary=project_types, backref="projects")
    