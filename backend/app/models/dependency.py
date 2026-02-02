import uuid
from sqlalchemy import Column, ForeignKey, Integer, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.core.enums import DependencyType

class Dependency(Base):
    __tablename__ = "dependencies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # The task that is blocked (Successor)
    successor_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    
    # The task that is doing the blocking (Predecessor)
    predecessor_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    
    type = Column(SAEnum(DependencyType), default=DependencyType.FS, nullable=False)
    lag_days = Column(Integer, default=0, nullable=False)

    # Relationships
    successor = relationship("Task", foreign_keys=[successor_id], back_populates="blocked_by")
    predecessor = relationship("Task", foreign_keys=[predecessor_id], back_populates="blocking")
