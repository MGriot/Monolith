import uuid
from sqlalchemy import Column, String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base

class Topic(Base):
    __tablename__ = "topics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    color = Column(String, default="#64748b") # Default slate-500
    is_active = Column(Boolean, default=True)

class WorkType(Base):
    __tablename__ = "work_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    icon = Column(String, nullable=True) # Icon identifier for Lucide/Shadcn
    is_active = Column(Boolean, default=True)
