import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.session import Base


class AutomationRule(Base):
    """"When <trigger> and <conditions> then <actions>" for the tasks of one project."""

    __tablename__ = "automation_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    trigger = Column(String, nullable=False)  # task_created | status_changed | assigned | due_soon | task_completed
    conditions = Column(JSONB, nullable=False, default=list)  # [{"field", "op", "value"}] - all must hold
    actions = Column(JSONB, nullable=False, default=list)  # [{"type", ...params}] - run in order
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AutomationRun(Base):
    """Audit trail: one row each time a rule's conditions matched (whether its actions then worked or not)."""

    __tablename__ = "automation_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id = Column(UUID(as_uuid=True), ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    status = Column(String, nullable=False)  # ok | error
    message = Column(Text, nullable=True)
    ran_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class WebhookDelivery(Base):
    """Outgoing webhook queue (same idea as `email_outbox`): requests INSERT, a worker POSTs with retries."""

    __tablename__ = "webhook_deliveries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webhook_id = Column(UUID(as_uuid=True), ForeignKey("webhooks.id", ondelete="SET NULL"), nullable=True)
    url = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    event = Column(String, nullable=False)
    payload = Column(JSONB, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending | sent | failed
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    delivered_at = Column(DateTime, nullable=True)


Index("ix_automation_rules_project_trigger", AutomationRule.project_id, AutomationRule.trigger)
Index("ix_automation_runs_rule_ran", AutomationRun.rule_id, AutomationRun.ran_at.desc())
Index("ix_automation_runs_task_id", AutomationRun.task_id)
Index("ix_webhook_deliveries_due", WebhookDelivery.status, WebhookDelivery.next_attempt_at)
