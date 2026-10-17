import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base


class EmailOutbox(Base):
    """Outgoing e-mail queue. Requests only INSERT here; a background worker delivers with retries/backoff,
    so a slow or unavailable mail server never blocks (or fails) an API call."""

    __tablename__ = "email_outbox"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind = Column(String, nullable=False, index=True)          # password_reset, assignment, digest, ...
    to_email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body_text = Column(Text, nullable=False)
    body_html = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending | sent | failed
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)

    __table_args__ = (Index("ix_email_outbox_due", "status", "next_attempt_at"),)


class JobRun(Base):
    """Last run of each scheduled job; claimed with an atomic UPDATE so only one process runs a job per slot."""

    __tablename__ = "job_runs"

    name = Column(String, primary_key=True)
    last_run_at = Column(DateTime, nullable=False)
