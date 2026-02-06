import uuid
from sqlalchemy import Column, String, Boolean, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

class ProjectTemplate(Base):
    __tablename__ = "project_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    
    # Hierarchical task structure stored as JSON for simplicity in templates
    # Structure: List of {title, description, topic_id, type_id, priority, subtasks: [...]}
    tasks_json = Column(JSON, nullable=False, default=[])
    
    is_active = Column(Boolean, default=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    owner = relationship("User", backref="project_templates")
