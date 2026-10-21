"""Task change log: plain-English lines of who changed what, written in the same transaction as the change.

The actor comes from, in this order:
  1. `actor_label` (contextvar) for changes no person made directly: an automation rule, the status roll-up;
  2. `db.info["actor_id"]`, set by `get_current_user` and the MCP bridge for the request's session.
Nothing here ever raises into the caller's change: a log line that cannot be built is skipped.
"""
import logging
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime
from typing import Any, Dict, Iterator, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import inspect as sa_inspect

logger = logging.getLogger(__name__)

actor_label: ContextVar[Optional[str]] = ContextVar("activity_actor_label", default=None)

ACTOR_KEY = "actor_id"
ROLLUP_LABEL = "Automatic (from subtasks)"

KINDS = ("created", "updated", "status_changed", "assigned", "archived", "restored", "deleted",
         "dependency_added", "dependency_removed")

# field -> label used in summaries, in the order they are listed
FIELDS: List[Tuple[str, str]] = [
    ("title", "title"), ("description", "description"), ("priority", "priority"),
    ("start_date", "start date"), ("due_date", "due date"), ("deadline_at", "deadline"),
    ("duration_days", "duration"), ("optimistic_days", "optimistic estimate"), ("normal_days", "normal estimate"),
    ("pessimistic_days", "pessimistic estimate"), ("is_milestone", "milestone"), ("budget", "budget"),
    ("real_cost", "actual cost"), ("risk_probability", "risk probability"), ("risk_impact", "risk impact"),
    ("parent_id", "parent"), ("tags", "tags"), ("recurrence_rule", "repeat"), ("color", "colour"),
    ("custom_values", "custom fields"), ("checklist", "checklist"), ("topics", "topics"), ("types", "work types"),
]
TEXTY = {"title", "description"}


@contextmanager
def acting_as(label: str) -> Iterator[None]:
    """Attribute log lines written inside the block to `label` instead of the signed-in user."""
    token = actor_label.set(label)
    try:
        yield
    finally:
        actor_label.reset(token)


def set_actor(db, user_id: Optional[UUID]) -> None:
    try:
        db.info[ACTOR_KEY] = user_id
    except Exception:  # mocks in tests, detached sessions
        pass


def _val(v: Any) -> Any:
    return v.value if hasattr(v, "value") else v


def _loaded(obj: Any, name: str) -> bool:
    try:
        return name not in sa_inspect(obj).unloaded
    except Exception:
        return hasattr(obj, name)


def snapshot(task: Any) -> Dict[str, Any]:
    """The tracked state of a task (only attributes already loaded: never triggers a lazy load)."""
    snap: Dict[str, Any] = {"status": _val(getattr(task, "status", None)),
                            "is_archived": bool(getattr(task, "is_archived", False))}
    for name, _ in FIELDS:
        if name in ("checklist", "topics", "types"):
            continue
        if _loaded(task, name):
            snap[name] = _val(getattr(task, name))
    if _loaded(task, "checklist"):
        items = getattr(task, "checklist", None) or []
        snap["checklist"] = (sum(1 for i in items if isinstance(i, dict) and i.get("is_done")), len(items))
    for rel in ("topics", "types"):
        if _loaded(task, rel):
            snap[rel] = sorted(t.name for t in getattr(task, rel) or [])
    if _loaded(task, "assignees"):
        snap["assignees"] = {str(u.id): (u.full_name or u.email) for u in getattr(task, "assignees") or []}
    return snap


def _fmt(field: str, v: Any) -> str:
    if v is None or v == "" or v == []:
        return "none"
    if isinstance(v, datetime) or isinstance(v, date):
        return v.strftime("%d %b %Y")
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, float):
        return f"{v:,.0f}" if v == int(v) else f"{v:,.2f}"
    if isinstance(v, int):
        return f"{v:,}" + (" days" if field.endswith("_days") else "")
    if isinstance(v, (list, tuple)) and field != "checklist":
        return ", ".join(map(str, v)) or "none"
    if field == "checklist":
        return f"{v[0]}/{v[1]} done"
    return str(v)


def diff(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, List[Any]]:
    out: Dict[str, List[Any]] = {}
    for key in set(before) | set(after):
        if key in before and key in after and before[key] != after[key]:
            out[key] = [before[key], after[key]]
    return out


def describe(changes: Dict[str, List[Any]]) -> List[Tuple[str, str, Dict[str, Any]]]:
    """Turn a diff into (kind, summary, changes) lines: status, archiving and assignment get their own line."""
    lines: List[Tuple[str, str, Dict[str, Any]]] = []
    if "is_archived" in changes:
        archived = changes["is_archived"][1]
        lines.append(("archived" if archived else "restored", "archived the task" if archived else "restored the task", {}))
    if "status" in changes:
        old, new = changes["status"]
        lines.append(("status_changed", f"changed status {old} → {new}", {"status": [old, new]}))
    if "assignees" in changes:
        old, new = changes["assignees"]
        added = [new[k] for k in new if k not in old]
        removed = [old[k] for k in old if k not in new]
        parts = ([f"assigned {', '.join(added)}"] if added else []) + ([f"unassigned {', '.join(removed)}"] if removed else [])
        if parts:
            lines.append(("assigned", "; ".join(parts), {"assignees": [sorted(old.values()), sorted(new.values())]}))
    values, actions, recorded = [], [], {}
    for field, label in FIELDS:
        if field not in changes:
            continue
        old, new = changes[field]
        if field == "description":
            actions.append("edited the description")
        elif field == "title":
            actions.append(f"renamed it from “{old}”")
        elif field == "parent_id":
            actions.append("moved it in the task tree")
        elif field == "custom_values":
            actions.append("updated custom fields")
        else:
            values.append(f"{label} {_fmt(field, old)} → {_fmt(field, new)}")
        recorded[field] = [_jsonable(old), _jsonable(new)]
    parts = ([f"changed {'; '.join(values)}"] if values else []) + actions
    if parts:
        lines.append(("updated", "; ".join(parts), recorded))
    return lines


def _jsonable(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, tuple):
        return list(v)
    if isinstance(v, dict):
        return {str(k): _jsonable(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    return v


def _actor(db) -> Tuple[Optional[UUID], Optional[str]]:
    label = actor_label.get()
    if label:
        return None, label
    try:
        return db.info.get(ACTOR_KEY), None
    except Exception:
        return None, None


def record(db, *, project_id: Optional[UUID], task_id: Optional[UUID], task_title: Optional[str], kind: str,
           summary: str, changes: Optional[Dict[str, Any]] = None) -> None:
    """Add one log line to the session (it commits or rolls back with the change it describes)."""
    if project_id is None:
        return  # personal tasks outside projects have no shared log
    try:
        from app.models.activity import ActivityEvent

        actor_id, label = _actor(db)
        db.add(ActivityEvent(project_id=project_id, task_id=task_id, task_title=task_title, actor_id=actor_id,
                             actor_label=label, kind=kind, summary=summary, changes=_jsonable(changes or {})))
    except Exception:  # never fail the change because of its log line
        logger.exception("Could not record activity for task %s", task_id)


def record_diff(db, task: Any, before: Dict[str, Any], after: Dict[str, Any]) -> None:
    for kind, summary, changes in describe(diff(before, after)):
        record(db, project_id=getattr(task, "project_id", None), task_id=getattr(task, "id", None),
               task_title=getattr(task, "title", None), kind=kind, summary=summary, changes=changes)
