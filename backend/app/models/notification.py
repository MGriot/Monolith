import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    type = Column(String, index=True) # assignment, unblocked, completion
    link = Column(String, nullable=True) # e.g. /projects/uuid/tasks/uuid
    
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", backref="notifications")
