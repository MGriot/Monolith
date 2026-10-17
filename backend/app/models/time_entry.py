import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base


class TimeEntry(Base):
    """A span of work logged by one user on one task. `ended_at IS NULL` means the timer is still running."""

    __tablename__ = "time_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)  # naive UTC, like every other column
    ended_at = Column(DateTime, nullable=True)
    note = Column(String, nullable=True)

    user = relationship("User", lazy="joined")
