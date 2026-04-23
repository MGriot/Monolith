import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base
import enum

class FolderType(str, enum.Enum):
    GENERIC = "generic"
    MEDIA = "media"
    NOTES = "notes"

class Folder(Base):
    __tablename__ = "folders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, nullable=False, index=True)
    type = Column(SAEnum(FolderType), default=FolderType.GENERIC)
    
    # Hierarchical parent
    parent_id = Column(UUID(as_uuid=True), ForeignKey("folders.id", ondelete="CASCADE"), nullable=True)
    
    # Ownership (Project or Independent Task)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    parent = relationship("Folder", remote_side=[id], backref="subfolders")
    project = relationship("Project", backref="folders")
    task = relationship("Task", backref="folders")
    owner = relationship("User", backref="folders")
    files = relationship("File", back_populates="folder", cascade="all, delete-orphan")
