import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import backref, relationship
from app.db.session import Base


class ActivityEvent(Base):
    """One line of a project's change log: who did what to which task (see app.core.activity)."""
    __tablename__ = "activity_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    # The task may be deleted later; the title snapshot keeps the line readable.
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    task_title = Column(String, nullable=True)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Set for changes no person made directly: "Automation: <rule>", "Automatic (from subtasks)".
    actor_label = Column(String, nullable=True)
    kind = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    changes = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    actor = relationship("User", lazy="selectin")
    project = relationship(
        "Project", backref=backref("activity_events", cascade="all, delete-orphan", passive_deletes=True)
    )

    __table_args__ = (Index("ix_activity_events_project_created", "project_id", "created_at"),)
