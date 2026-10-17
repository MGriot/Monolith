"""Automation rules: "when <trigger> and <conditions> then <actions>" per project, plus the project webhooks.

Flow: `crud_task` calls `fire_task_events()` at the end of create / update / update_assignees, inside the request's
unit of work (see docs/how-to/transactions.md). For each event:

  1. the project's active webhooks get a row in the `webhook_deliveries` queue (sent by a worker after the commit);
  2. every enabled rule of the project with that trigger whose conditions match runs its actions inside a SAVEPOINT,
     so a failing rule undoes only itself; the outcome goes to `automation_runs` (also on failure).

Safety: nothing here may fail the user's request (`dispatch` swallows and logs everything), and an automation that
changes the task fires the hooks again, so a chain is bounded - at most `MAX_DEPTH` levels, and a (rule, task) pair
runs at most once per chain.
"""
import contextvars
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Priority, Status

logger = logging.getLogger(__name__)

TRIGGERS = ("task_created", "status_changed", "assigned", "due_soon", "task_completed")
TRIGGER_WEBHOOK_EVENTS = {
    "task_created": "task.created",
    "status_changed": "task.status_changed",
    "assigned": "task.assigned",
    "task_completed": "task.completed",
}
CONDITION_FIELDS = ("status", "old_status", "priority", "assignee", "title", "tags", "is_milestone", "due_date")
CONDITION_OPS = ("eq", "neq", "in", "not_in", "contains", "is_set", "is_empty")
ACTION_TYPES = ("set_field", "assign_user", "notify", "call_webhook")
SET_FIELDS = ("status", "priority", "assignee")
NOTIFY_TARGETS = ("assignees", "owner", "user")

MAX_DEPTH = 3
MAX_RULES_PER_PROJECT = 50
MAX_CONDITIONS = 10
MAX_ACTIONS = 10
DUE_SOON_WINDOW = timedelta(hours=48)
RUN_RETENTION = timedelta(days=90)

STATUS_VALUES = [s.value for s in Status]
PRIORITY_VALUES = [p.value for p in Priority]


# ------------------------------------------------------------------------------------------------ validation
def _uuid_str(value: Any, what: str) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        raise ValueError(f"{what} must be a valid id")


def _enum_value(value: Any, allowed: Sequence[str], what: str) -> str:
    if value not in allowed:
        raise ValueError(f"{what} must be one of: {', '.join(allowed)}")
    return value


def normalize_condition(raw: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("A condition must be an object")
    fld, op = raw.get("field"), raw.get("op", "eq")
    if fld not in CONDITION_FIELDS:
        raise ValueError(f"Unknown condition field '{fld}'")
    if op not in CONDITION_OPS:
        raise ValueError(f"Unknown condition operator '{op}'")
    if op in ("is_set", "is_empty"):
        return {"field": fld, "op": op}
    if op == "contains" and fld not in ("title", "tags"):
        raise ValueError("'contains' only works on title and tags")
    value = raw.get("value")
    if op in ("in", "not_in"):
        if not isinstance(value, list) or not value:
            raise ValueError(f"'{op}' needs a non-empty list of values")
        values = value
    else:
        values = [value]
    cleaned = []
    for v in values:
        if fld in ("status", "old_status"):
            cleaned.append(_enum_value(v, STATUS_VALUES, "status"))
        elif fld == "priority":
            cleaned.append(_enum_value(v, PRIORITY_VALUES, "priority"))
        elif fld == "assignee":
            cleaned.append(_uuid_str(v, "assignee"))
        elif fld == "is_milestone":
            if not isinstance(v, bool):
                raise ValueError("is_milestone must be true or false")
            cleaned.append(v)
        elif fld == "due_date":
            raise ValueError("due_date only supports 'is_set' and 'is_empty'")
        else:
            if not isinstance(v, str) or not v.strip() or len(v) > 200:
                raise ValueError(f"{fld} needs a text value (max 200 characters)")
            cleaned.append(v.strip())
    return {"field": fld, "op": op, "value": cleaned if op in ("in", "not_in") else cleaned[0]}


def normalize_action(raw: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("An action must be an object")
    kind = raw.get("type")
    if kind not in ACTION_TYPES:
        raise ValueError(f"Unknown action type '{kind}'")
    if kind == "set_field":
        fld = raw.get("field")
        if fld not in SET_FIELDS:
            raise ValueError(f"set_field can change: {', '.join(SET_FIELDS)}")
        value = raw.get("value")
        if fld == "status":
            value = _enum_value(value, STATUS_VALUES, "status")
        elif fld == "priority":
            value = _enum_value(value, PRIORITY_VALUES, "priority")
        else:
            value = None if value in (None, "") else _uuid_str(value, "assignee")
        return {"type": kind, "field": fld, "value": value}
    if kind == "assign_user":
        return {"type": kind, "user_id": _uuid_str(raw.get("user_id"), "user_id")}
    if kind == "notify":
        to = raw.get("to", "assignees")
        if to not in NOTIFY_TARGETS:
            raise ValueError(f"notify 'to' must be one of: {', '.join(NOTIFY_TARGETS)}")
        message = raw.get("message")
        if not isinstance(message, str) or not message.strip() or len(message) > 500:
            raise ValueError("notify needs a message (max 500 characters)")
        out = {"type": kind, "to": to, "message": message.strip(), "email": bool(raw.get("email", True))}
        if to == "user":
            out["user_id"] = _uuid_str(raw.get("user_id"), "user_id")
        return out
    return {"type": kind, "webhook_id": _uuid_str(raw.get("webhook_id"), "webhook_id")}


def validate_rule(trigger: str, conditions: Sequence[Dict[str, Any]], actions: Sequence[Dict[str, Any]]) -> Tuple[list, list]:
    """-> (conditions, actions) normalised, or ValueError with a message fit for the user."""
    if trigger not in TRIGGERS:
        raise ValueError(f"Unknown trigger '{trigger}'")
    if len(conditions) > MAX_CONDITIONS:
        raise ValueError(f"At most {MAX_CONDITIONS} conditions per rule")
    if not actions:
        raise ValueError("A rule needs at least one action")
    if len(actions) > MAX_ACTIONS:
        raise ValueError(f"At most {MAX_ACTIONS} actions per rule")
    conds = [normalize_condition(c) for c in conditions]
    for c in conds:
        if c["field"] == "old_status" and trigger != "status_changed":
            raise ValueError("'old_status' is only available on the 'status_changed' trigger")
    return conds, [normalize_action(a) for a in actions]


def referenced_user_ids(actions: Iterable[Dict[str, Any]]) -> List[str]:
    ids = []
    for a in actions:
        if a["type"] == "assign_user" or (a["type"] == "notify" and a.get("to") == "user"):
            ids.append(a["user_id"])
        elif a["type"] == "set_field" and a["field"] == "assignee" and a["value"]:
            ids.append(a["value"])
    return ids


def referenced_webhook_ids(actions: Iterable[Dict[str, Any]]) -> List[str]:
    return [a["webhook_id"] for a in actions if a["type"] == "call_webhook"]


# ------------------------------------------------------------------------------------------------ matching
def _norm(v: Any) -> Any:
    return str(v) if isinstance(v, UUID) else v


def condition_holds(cond: Dict[str, Any], snap: Dict[str, Any]) -> bool:
    fld, op, expected = cond["field"], cond["op"], cond.get("value")
    actual = snap.get(fld)
    many = isinstance(actual, (list, tuple, set))
    items = [_norm(x) for x in actual] if many else None
    if op == "is_set":
        return bool(items) if many else actual not in (None, "")
    if op == "is_empty":
        return not items if many else actual in (None, "")
    if op == "contains":
        if many:
            return any(str(expected).lower() == str(x).lower() for x in items)
        return actual is not None and str(expected).lower() in str(actual).lower()
    if op in ("in", "not_in"):
        hit = any(e in items for e in expected) if many else _norm(actual) in expected
        return hit if op == "in" else not hit
    hit = expected in items if many else _norm(actual) == expected
    return hit if op == "eq" else not hit


def matches(conditions: Sequence[Dict[str, Any]], snap: Dict[str, Any]) -> bool:
    """Simple AND of field predicates; no conditions = always."""
    return all(condition_holds(c, snap) for c in conditions or [])


_PLACEHOLDER = re.compile(r"\{(task_title|status|priority|project)\}")


def render_text(text: str, snap: Dict[str, Any]) -> str:
    """Substitute {task_title} {status} {priority} {project}; unknown placeholders are left alone."""
    values = {
        "task_title": snap.get("title"), "status": snap.get("status"),
        "priority": snap.get("priority"), "project": snap.get("project_name"),
    }
    return _PLACEHOLDER.sub(lambda m: str(values[m.group(1)] or ""), text)


# ------------------------------------------------------------------------------------------------ events
@dataclass
class TaskEvent:
    trigger: str
    task_id: UUID
    project_id: Optional[UUID]
    changes: Dict[str, Tuple[Any, Any]] = field(default_factory=dict)  # {"status": (old, new)}
    added_assignees: List[str] = field(default_factory=list)


def build_events(
    *, task_id: UUID, project_id: Optional[UUID], created: bool = False,
    old_status: Optional[str] = None, new_status: Optional[str] = None, added_assignees: Sequence[Any] = (),
) -> List[TaskEvent]:
    """The events one create/update produced, in the order they are dispatched."""
    events: List[TaskEvent] = []
    added = [str(a) for a in added_assignees]
    if created:
        events.append(TaskEvent("task_created", task_id, project_id))
    elif old_status is not None and new_status is not None and old_status != new_status:
        events.append(TaskEvent("status_changed", task_id, project_id, {"status": (old_status, new_status)}))
    if new_status == Status.DONE.value and old_status != Status.DONE.value:
        events.append(TaskEvent("task_completed", task_id, project_id))
    if added:
        events.append(TaskEvent("assigned", task_id, project_id, added_assignees=added))
    return events


@dataclass
class Chain:
    depth: int = 0
    visited: set = field(default_factory=set)  # {(rule_id, task_id)} that already ran in this chain


_chain: contextvars.ContextVar = contextvars.ContextVar("automation_chain", default=None)


def _status_value(v: Any) -> Optional[str]:
    return v.value if hasattr(v, "value") else v


# ------------------------------------------------------------------------------------------------ data access
async def load_snapshot(db: AsyncSession, event: TaskEvent) -> Optional[Dict[str, Any]]:
    """Plain-data view of the task (column selects only: no ORM instance to expire or lazy-load)."""
    from app.models.associations import task_assignees
    from app.models.project import Project
    from app.models.task import Task

    row = (
        await db.execute(
            select(Task.id, Task.title, Task.status, Task.priority, Task.project_id, Task.owner_id,
                   Task.is_milestone, Task.due_date, Task.tags).where(Task.id == event.task_id)
        )
    ).first()
    if row is None:
        return None
    assignees = (await db.execute(select(task_assignees.c.user_id).where(task_assignees.c.task_id == event.task_id))).scalars().all()
    project_name = None
    if row.project_id:
        project_name = (await db.execute(select(Project.name).where(Project.id == row.project_id))).scalar()
    return {
        "id": str(row.id), "title": row.title, "status": _status_value(row.status), "priority": _status_value(row.priority),
        "project_id": str(row.project_id) if row.project_id else None, "project_name": project_name,
        "owner_id": str(row.owner_id) if row.owner_id else None, "is_milestone": bool(row.is_milestone),
        "due_date": row.due_date.isoformat() if row.due_date else None, "tags": list(row.tags or []),
        "assignee": [str(a) for a in assignees],
        "old_status": event.changes["status"][0] if "status" in event.changes else None,
    }


async def load_rules(db: AsyncSession, project_id: UUID, trigger: str) -> list:
    from app.models.automation import AutomationRule

    rows = (
        await db.execute(
            select(AutomationRule.id, AutomationRule.name, AutomationRule.conditions, AutomationRule.actions)
            .where(AutomationRule.project_id == project_id, AutomationRule.trigger == trigger, AutomationRule.enabled == True)  # noqa: E712
            .order_by(AutomationRule.created_at)
        )
    ).all()
    return list(rows)


async def record_run(db: AsyncSession, rule_id: UUID, task_id: UUID, status: str, message: Optional[str]) -> None:
    from app.models.automation import AutomationRun

    db.add(AutomationRun(rule_id=rule_id, task_id=task_id, status=status, message=(message or "")[:1000] or None))
    await db.flush()


def webhook_context(snap: Dict[str, Any], event: TaskEvent, message: Optional[str] = None) -> Dict[str, Any]:
    from app.core.mailer import absolute_url

    project = snap.get("project_id")
    link = f"/projects/{project}?task_id={snap['id']}" if project else f"/tasks?task_id={snap['id']}"
    return {
        "task": {"id": snap["id"], "title": snap["title"], "status": snap["status"], "priority": snap["priority"],
                 "assignees": snap["assignee"]},
        "project": {"id": project, "name": snap.get("project_name")},
        "changes": {k: [_status_value(a), _status_value(b)] for k, (a, b) in event.changes.items()},
        "url": absolute_url(link), "message": message,
    }


async def queue_project_webhooks(db: AsyncSession, event: TaskEvent, snap: Dict[str, Any]) -> int:
    """Queue the event for every active webhook of the project (isolated: a failure never leaks out)."""
    name = TRIGGER_WEBHOOK_EVENTS.get(event.trigger)
    if not name or not event.project_id:
        return 0
    # Moving a task to Done fires `task.completed` already; do not tell the channel twice.
    if event.trigger == "status_changed" and event.changes.get("status", (None, None))[1] == Status.DONE.value:
        return 0
    try:
        from app.core.webhooks import enqueue_delivery, format_event_payload
        from app.models.webhook import Webhook

        async with db.begin_nested():
            hooks = (
                await db.execute(
                    select(Webhook.id, Webhook.url, Webhook.provider).where(Webhook.project_id == event.project_id, Webhook.is_active == True)  # noqa: E712
                )
            ).all()
            ctx = webhook_context(snap, event)
            for hook in hooks:
                await enqueue_delivery(db, webhook=hook, event=name, payload=format_event_payload(hook.provider or "generic", name, ctx))
        return len(hooks)
    except Exception:  # noqa: BLE001
        logger.exception("Could not queue project webhooks for %s", event.trigger)
        return 0


# ------------------------------------------------------------------------------------------------ actions
def resolve_recipients(action: Dict[str, Any], snap: Dict[str, Any]) -> List[str]:
    if action["to"] == "assignees":
        return list(snap["assignee"])
    if action["to"] == "owner":
        return [snap["owner_id"]] if snap.get("owner_id") else []
    return [action["user_id"]]


async def execute_action(db: AsyncSession, action: Dict[str, Any], rule: Any, snap: Dict[str, Any], event: TaskEvent) -> str:
    """Run one action; returns a short log line. Raises on failure (the caller's SAVEPOINT undoes the rule)."""
    kind = action["type"]
    if kind in ("set_field", "assign_user"):
        from app.crud import crud_task

        task = await crud_task.task.get(db, event.task_id)
        if task is None:
            raise LookupError("the task no longer exists")
        if kind == "assign_user":
            uid = UUID(action["user_id"])
            current = [u.id for u in task.assignees]
            if uid in current:
                return "assignee already set"
            await crud_task.task.update(db, db_obj=task, obj_in={"assignee_ids": current + [uid]})
            return "assigned a user"
        fld, value = action["field"], action["value"]
        if fld == "status":
            if _status_value(task.status) == value:
                return f"status already {value}"
            await crud_task.task.update(db, db_obj=task, obj_in={"status": Status(value)})
        elif fld == "priority":
            if _status_value(task.priority) == value:
                return f"priority already {value}"
            await crud_task.task.update(db, db_obj=task, obj_in={"priority": Priority(value)})
        else:
            await crud_task.task.update(db, db_obj=task, obj_in={"assignee_ids": [UUID(value)] if value else []})
        return f"set {fld} to {value}"

    if kind == "notify":
        from app.core.mailer import absolute_url, enqueue_email
        from app.crud.crud_notification import notification as notification_crud
        from app.models.user import User
        from app.schemas.notification import NotificationCreate

        text = render_text(action["message"], snap)
        project = snap.get("project_id")
        link = f"/projects/{project}?task_id={snap['id']}" if project else f"/tasks?task_id={snap['id']}"
        recipients = list(dict.fromkeys(resolve_recipients(action, snap)))
        users = []
        if recipients:
            users = (
                await db.execute(
                    select(User.id, User.email, User.full_name).where(User.id.in_([UUID(r) for r in recipients]), User.is_active == True)  # noqa: E712
                )
            ).all()
        for user in users:
            await notification_crud.create(
                db, obj_in=NotificationCreate(user_id=user.id, title=f"Automation: {rule.name}"[:200], message=text, type="automation", link=link)
            )
            if action.get("email", True):
                await enqueue_email(
                    db, to=user.email, kind="automation", template="automation", name=user.full_name or user.email,
                    rule_name=rule.name, message=text, task_title=snap["title"], project_name=snap.get("project_name"),
                    link=absolute_url(link),
                )
        return f"notified {len(users)} user(s)"

    # call_webhook
    from app.core.webhooks import enqueue_delivery, format_event_payload
    from app.models.webhook import Webhook

    hook = (
        await db.execute(
            select(Webhook.id, Webhook.url, Webhook.provider).where(
                Webhook.id == UUID(action["webhook_id"]), Webhook.project_id == event.project_id, Webhook.is_active == True  # noqa: E712
            )
        )
    ).first()
    if hook is None:
        raise LookupError("webhook not found, inactive or not part of this project")
    ctx = webhook_context(snap, event, message=f"Rule '{rule.name}'")
    await enqueue_delivery(db, webhook=hook, event="automation", payload=format_event_payload(hook.provider or "generic", "automation", ctx))
    return "webhook queued"


# ------------------------------------------------------------------------------------------------ dispatch
async def dispatch(db: AsyncSession, event: TaskEvent, *, rules: Optional[list] = None) -> None:
    """Never raises (except cancellation): automations must not fail the change that triggered them."""
    try:
        await _dispatch(db, event, rules)
    except Exception:  # noqa: BLE001
        logger.exception("Automation dispatch for %s failed", event.trigger)


async def _dispatch(db: AsyncSession, event: TaskEvent, rules: Optional[list]) -> None:
    if event.project_id is None:
        return
    chain = _chain.get() or Chain()
    snap = await load_snapshot(db, event)
    if snap is None:
        return
    if rules is None:
        await queue_project_webhooks(db, event, snap)
        rules = await load_rules(db, event.project_id, event.trigger)
    for rule in rules:
        snap = await load_snapshot(db, event) or snap  # earlier rules may have changed the task
        if not matches(rule.conditions, snap):
            continue
        key = (rule.id, event.task_id)
        if key in chain.visited:
            await record_run(db, rule.id, event.task_id, "error", "Skipped: this rule already ran for this task in the same chain (loop guard)")
            continue
        if chain.depth >= MAX_DEPTH:
            await record_run(db, rule.id, event.task_id, "error", f"Skipped: automations triggered other automations more than {MAX_DEPTH} levels deep")
            continue
        chain.visited.add(key)
        token = _chain.set(Chain(depth=chain.depth + 1, visited=chain.visited))
        status, message = "ok", None
        try:
            async with db.begin_nested():  # SAVEPOINT: a failing rule undoes only its own changes
                lines = []
                for action in rule.actions:
                    lines.append(await execute_action(db, action, rule, snap, event))
            message = "; ".join(lines)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Automation rule %s failed: %s", rule.id, exc)
            status, message = "error", f"{type(exc).__name__}: {exc}"
        finally:
            _chain.reset(token)
        await record_run(db, rule.id, event.task_id, status, message)


async def fire_task_events(db: AsyncSession, **kwargs: Any) -> None:
    """Called by crud_task (see `build_events` for the arguments)."""
    for event in build_events(**kwargs):
        await dispatch(db, event)


# ------------------------------------------------------------------------------------------------ due_soon
async def run_due_soon(db: AsyncSession, now: Optional[datetime] = None) -> int:
    """Daily sweep (07:00 UTC job): fire `due_soon` rules for open tasks due within 48 h. A rule fires once per task
    (not again on the next day's sweep). Returns the number of (rule, task) pairs run."""
    from app.db.transaction import transaction
    from app.models.automation import AutomationRule, AutomationRun
    from app.models.task import Task

    now = now or datetime.utcnow()
    horizon = now + DUE_SOON_WINDOW
    await db.execute(delete(AutomationRun).where(AutomationRun.ran_at < now - RUN_RETENTION))
    await db.commit()
    rules = (
        await db.execute(
            select(AutomationRule.id, AutomationRule.project_id, AutomationRule.name, AutomationRule.conditions, AutomationRule.actions)
            .where(AutomationRule.trigger == "due_soon", AutomationRule.enabled == True)  # noqa: E712
        )
    ).all()
    count = 0
    for rule in rules:
        task_ids = (
            await db.execute(
                select(Task.id).where(
                    Task.project_id == rule.project_id, Task.is_archived == False, Task.status != Status.DONE,  # noqa: E712
                    ((Task.due_date >= now) & (Task.due_date <= horizon)) | ((Task.deadline_at >= now) & (Task.deadline_at <= horizon)),
                )
            )
        ).scalars().all()
        already = set(
            (await db.execute(select(AutomationRun.task_id).where(AutomationRun.rule_id == rule.id, AutomationRun.ran_at >= now - 3 * DUE_SOON_WINDOW))).scalars().all()
        )
        for task_id in task_ids:
            if task_id in already:
                continue
            try:
                async with transaction(db):
                    await dispatch(db, TaskEvent("due_soon", task_id, rule.project_id), rules=[rule])
                count += 1
            except Exception:  # noqa: BLE001
                logger.exception("due_soon rule %s failed for task %s", rule.id, task_id)
    return count
