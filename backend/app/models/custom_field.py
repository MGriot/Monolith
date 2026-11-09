import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from app.db.session import Base


class CustomFieldDef(Base):
    """A user-defined field on projects or tasks.

    `project_id` NULL makes it a global definition (managed by superusers) that every project gets; otherwise it
    belongs to one project. `applies_to` says which table holds the values: `projects.custom_values` or
    `tasks.custom_values`, keyed by this id either way.
    """

    __tablename__ = "custom_field_defs"
    __table_args__ = (CheckConstraint("applies_to IN ('project', 'task')", name="ck_custom_field_defs_applies_to"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    applies_to = Column(String, nullable=False, default="task", server_default="task")  # project | task
    name = Column(String, nullable=False)
    field_type = Column(String, nullable=False)  # text | number | currency | select | date | user | checkbox | url
    options = Column(JSONB, nullable=False, default=list)  # select choices
    unit = Column(String(32), nullable=True)  # number only, free text ("h", "kg", "%")
    currency = Column(String(3), nullable=True)  # currency only, ISO 4217; NULL = the instance CURRENCY
    min_value = Column(Float, nullable=True)  # number / currency
    max_value = Column(Float, nullable=True)
    decimals = Column(SmallInteger, nullable=True)  # number / currency, 0-6
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def scope(self) -> str:
        return "global" if self.project_id is None else "project"
