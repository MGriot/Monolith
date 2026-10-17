import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from app.db.session import Base


class CustomFieldDef(Base):
    """A user-defined field on every task of one project. Values live in `tasks.custom_values`, keyed by this id."""

    __tablename__ = "custom_field_defs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    field_type = Column(String, nullable=False)  # text | number | select | date | user
    options = Column(JSONB, nullable=False, default=list)  # select choices
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
