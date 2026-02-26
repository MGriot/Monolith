import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base
from app.models.associations import team_members, team_shares
from datetime import datetime

class Team(Base):
    __tablename__ = "teams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Many-to-many relationship with User
    members = relationship("User", secondary=team_members, backref="teams")
    owner = relationship("User", foreign_keys=[owner_id])
    shared_with = relationship("User", secondary=team_shares, backref="shared_teams")
