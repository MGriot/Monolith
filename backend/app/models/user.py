import uuid
from sqlalchemy import Column, DateTime, String, Boolean
from sqlalchemy.sql import expression
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, index=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean(), default=True)
    is_superuser = Column(Boolean(), default=False)
    email_verified_at = Column(DateTime, nullable=True)
    # 'pending': self-registered, waiting for an administrator (inactive, no usable password). 'approved': everyone else.
    approval_status = Column(String, nullable=False, default="approved", server_default="approved")
    # Set when an administrator issued a temporary password; cleared once the user chooses their own.
    must_change_password = Column(Boolean(), nullable=False, default=False, server_default=expression.false())
    # Secret in the personal iCalendar feed URL (calendar apps cannot send an Authorization header). Rotatable/revocable.
    calendar_token = Column(String, unique=True, index=True, nullable=True)
    # Opt-outs for e-mail (in-app notifications are unaffected)
    notify_email_assignments = Column(Boolean(), nullable=False, default=True, server_default=expression.true())
    notify_email_digest = Column(Boolean(), nullable=False, default=True, server_default=expression.true())
