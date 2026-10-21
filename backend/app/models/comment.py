import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship, backref
from app.db.session import Base

class Comment(Base):
    __tablename__ = "comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    content = Column(Text, nullable=False)
    
    # Author
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Polymorphic Foreign Keys (Nullable)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    idea_id = Column(UUID(as_uuid=True), ForeignKey("ideas.id", ondelete="CASCADE"), nullable=True, index=True)
    
    # Threading (Self-Referential)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Chat Features
    attachments = Column(ARRAY(String), default=[])
    links = Column(ARRAY(String), default=[])

    # Relationships
    author = relationship("User", backref="threaded_comments", lazy="selectin")
    
    # ON DELETE CASCADE in the database; without passive_deletes the ORM would null the FKs and orphan the comments
    project = relationship("Project", backref=backref("threaded_comments", cascade="all, delete-orphan", passive_deletes=True))
    task = relationship("Task", backref=backref("threaded_comments", cascade="all, delete-orphan", passive_deletes=True))
    idea = relationship("Idea", backref="threaded_comments")
    
    # Threading Relationships
    parent = relationship("Comment", remote_side=[id], back_populates="replies")
    replies = relationship("Comment", back_populates="parent", cascade="all, delete-orphan", lazy="selectin")
