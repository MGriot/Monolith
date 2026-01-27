import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Table, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.core.enums import Status

project_members = Table(
    "project_members",
    Base.metadata,
    Column("project_id", UUID(as_uuid=True), ForeignKey("projects.id"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
)

class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    topic = Column(String, index=True)
    type = Column(String, index=True)
    status = Column(SAEnum(Status), default=Status.TODO)
    progress_percent = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    start_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    tags = Column(ARRAY(String), default=[])
    attachments = Column(ARRAY(String), default=[])
    
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # Relationships
    owner = relationship("User", backref="owned_projects", foreign_keys=[owner_id])
    members = relationship("User", secondary=project_members, backref="member_projects")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")