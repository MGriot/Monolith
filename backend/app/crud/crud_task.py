from collections import defaultdict
from typing import List, Union, Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.crud.base import CRUDBase
from app.models.task import Task
from app.models.metadata import Topic, WorkType
from app.schemas.task import TaskCreate, TaskUpdate
from app.core.enums import Status
from app.core.utils import clean_dict_datetimes
from app.db.transaction import atomic, commit
from app.core.automations import fire_task_events


def _enum_val(v: Any) -> Any:
    return v.value if hasattr(v, "value") else v

def reconcile_dates(obj_data: dict, start0, due0, dur0) -> dict:
    """Keep start, due and duration_days consistent for an update, in place (dur=1 means the same day).

    Whatever the caller sent wins: duration (with start) moves the due date; start AND due together set the
    duration; start alone keeps the duration and moves the due date; due alone sets the duration.
    Key presence matters, not truthiness: an explicit null just clears that field.
    """
    from datetime import timedelta

    start = obj_data["start_date"] if "start_date" in obj_data else start0
    due = obj_data["due_date"] if "due_date" in obj_data else due0
    dur = obj_data["duration_days"] if "duration_days" in obj_data else dur0
    sent = obj_data.keys()

    if "duration_days" in sent:
        if start and dur and dur > 0:
            obj_data["due_date"] = start + timedelta(days=dur - 1)
    elif "start_date" in sent and "due_date" in sent:
        if start and due:
            obj_data["duration_days"] = (due - start).days + 1
    elif "start_date" in sent:
        if start and dur and dur > 0:
            obj_data["due_date"] = start + timedelta(days=dur - 1)
        elif start and due:
            obj_data["duration_days"] = (due - start).days + 1
    elif "due_date" in sent:
        if start and due:
            obj_data["duration_days"] = (due - start).days + 1
    return obj_data


class CRUDTask(CRUDBase[Task, TaskCreate, TaskUpdate]):
    # --- tree loading -------------------------------------------------------------------------------
    # The old implementation hand-nested selectinload() four levels deep: ~30 queries for 155 tasks, and a
    # MissingGreenlet (HTTP 500) as soon as a tree was deeper than that. Now the whole subtree is fetched with one
    # recursive CTE, its relations with one query each (constant, independent of depth/size), and the tree is
    # assembled in memory.

    @staticmethod
    def _load_options():
        return (
            joinedload(Task.owner),
            joinedload(Task.topic_ref),
            joinedload(Task.type_ref),
            selectinload(Task.project),
            selectinload(Task.assignees),
            selectinload(Task.blocked_by),
            selectinload(Task.blocking),
            selectinload(Task.topics),
            selectinload(Task.types),
        )

    async def _load_trees(self, db: AsyncSession, root_ids: List[UUID]) -> Dict[UUID, Task]:
        """Load the given tasks and all of their descendants, with `subtasks` populated recursively."""
        if not root_ids:
            return {}
        tree = select(Task.id).where(Task.id.in_(root_ids)).cte("task_tree", recursive=True)
        # UNION (not UNION ALL): a corrupt parent cycle terminates instead of looping forever
        tree = tree.union(select(Task.id).where(Task.parent_id == tree.c.id))
        result = await db.execute(
            select(Task).where(Task.id.in_(select(tree.c.id))).options(*self._load_options())
        )
        by_id: Dict[UUID, Task] = {t.id: t for t in result.unique().scalars().all()}
        self._attach_children(by_id)
        return by_id

    @staticmethod
    def _attach_children(by_id: Dict[UUID, Task]) -> None:
        """Populate `.subtasks` of every task from the flat id->task map, sorted by (sort_index, created_at)."""
        children: Dict[UUID, List[Task]] = defaultdict(list)
        for t in by_id.values():
            if t.parent_id in by_id:
                children[t.parent_id].append(t)
        for t in by_id.values():
            kids = sorted(children.get(t.id, []), key=lambda x: (x.sort_index or 0, x.created_at or datetime.min))
            # set_committed_value: populate the collection without marking it modified (no UPDATEs on commit)
            set_committed_value(t, "subtasks", kids)

    async def get(self, db: AsyncSession, id: Any) -> Optional[Task]:
        by_id = await self._load_trees(db, [id])
        return by_id.get(id)

    async def get_multi_by_project(
        self, db: AsyncSession, *, project_id: UUID, skip: int = 0, limit: int = 100, parent_id: Optional[UUID] = None, include_archived: bool = False
    ) -> List[Task]:
        query = select(self.model.id).filter(self.model.project_id == project_id)

        if not include_archived:
            query = query.filter(self.model.is_archived == False)

        if parent_id:
            query = query.filter(self.model.parent_id == parent_id)
        else:
            # Only top-level tasks by default
            query = query.filter(self.model.parent_id == None)

        root_ids = (
            await db.execute(
                query.order_by(self.model.sort_index.asc(), self.model.created_at.asc()).offset(skip).limit(limit)
            )
        ).scalars().all()
        by_id = await self._load_trees(db, list(root_ids))
        return [by_id[i] for i in root_ids if i in by_id]

    def calculate_task_progress(self, task: Task) -> float:
        """
        Calculate task progress. 
        If checklist exists, progress = (done_items / total_items).
        Otherwise, progress is status-based.
        """
        if task.checklist and len(task.checklist) > 0:
            total = len(task.checklist)
            done = sum(1 for item in task.checklist if item.get("is_done", False))
            return round((done / total) * 100.0, 2)
        
        # Fallback to status-based progress
        if task.status == Status.DONE:
            return 100.0
        elif task.status == Status.REVIEW:
            return 80.0
        elif task.status == Status.IN_PROGRESS:
            return 50.0
        elif task.status == Status.ON_HOLD:
            return 25.0
        return 0.0

    async def sync_project_from_tasks(self, db: AsyncSession, project_id: UUID):
        if not project_id:
            return
            
        from app.crud.crud_project import project as project_crud
        
        # Get all tasks for the project to aggregate data
        result = await db.execute(
            select(self.model)
            .filter(self.model.project_id == project_id)
            .options(
                selectinload(Task.topics),
                selectinload(Task.types)
            )
        )
        all_tasks = result.scalars().all()
        if not all_tasks:
            return

        # 1. Progress calculation (Top-level tasks only for progress)
        top_tasks = [t for t in all_tasks if t.parent_id is None]
        total = len(top_tasks)
        score_sum = 0
        for t in top_tasks:
            score_sum += self.calculate_task_progress(t)
        
        progress = round(float(score_sum) / total, 2) if total > 0 else 0.0

        # 2. Date aggregation
        start_dates = [t.start_date for t in all_tasks if t.start_date]
        # A task ends at its planned due date; its hard deadline only stands in when it has none. Counting every
        # deadline would make the project's planned finish equal its latest deadline and hide deadline risk.
        effective_end_dates = [t.due_date or t.deadline_at for t in all_tasks if t.due_date or t.deadline_at]
        
        new_start_date = min(start_dates) if start_dates else None
        new_due_date = max(effective_end_dates) if effective_end_dates else None

        # 3. Topic & Type inheritance (Aggregation)
        topic_ids = set()
        type_ids = set()
        for t in all_tasks:
            for topic in t.topics:
                topic_ids.add(topic.id)
            for wtype in t.types:
                type_ids.add(wtype.id)
            # Support legacy single FKs too
            if t.topic_id: topic_ids.add(t.topic_id)
            if t.type_id: type_ids.add(t.type_id)

        project_obj = await project_crud.get(db, id=project_id)
        if project_obj:
            update_data = {}
            if abs(project_obj.progress_percent - progress) > 0.01:
                update_data["progress_percent"] = progress
            
            if new_start_date and project_obj.start_date != new_start_date:
                update_data["start_date"] = new_start_date
                
            if new_due_date and project_obj.due_date != new_due_date:
                update_data["due_date"] = new_due_date

            # Add aggregated topic/type IDs to update
            if topic_ids:
                update_data["topic_ids"] = list(topic_ids)
            if type_ids:
                update_data["type_ids"] = list(type_ids)

            if update_data:
                await project_crud.update(db, db_obj=project_obj, obj_in=update_data)

    async def update_parent_status_recursive(self, db: AsyncSession, parent_id: UUID):
        """
        Updates the status of a parent task based on its children's status.
        Bubbles up to the root.
        """
        # Load parent with its children
        parent = await self.get(db, id=parent_id)
        if not parent or not parent.subtasks:
            return

        total = len(parent.subtasks)
        done_count = sum(1 for s in parent.subtasks if s.status == Status.DONE)
        in_progress_count = sum(1 for s in parent.subtasks if s.status in [Status.IN_PROGRESS, Status.REVIEW])
        
        new_status = Status.TODO
        if done_count == total:
            # Check if parent itself is blocked before moving to DONE
            active_blockers = await self.check_for_active_blockers(db, parent_id)
            if active_blockers:
                new_status = Status.IN_PROGRESS
            else:
                new_status = Status.DONE
        elif in_progress_count > 0 or done_count > 0:
            new_status = Status.IN_PROGRESS
        
        if parent.status != new_status:
            # Use direct update to avoid triggering another loop if not needed, 
            # but we NEED to bubble up, so we call update which calls this again.
            await self.update(db, db_obj=parent, obj_in={"status": new_status})
            # The .update() call will handle the next level up if parent.parent_id exists.

    async def is_blocked_by_recursive(self, db: AsyncSession, item_id: UUID, blocker_candidate_id: UUID, visited: set) -> bool:
        if item_id == blocker_candidate_id:
            return True
        if item_id in visited:
            return False
        visited.add(item_id)
        
        # Check Dependency table (preferred)
        from app.models.dependency import Dependency
        res = await db.execute(select(Dependency.predecessor_id).filter(Dependency.successor_id == item_id))
        predecessors = res.scalars().all()
        for pred_id in predecessors:
            if await self.is_blocked_by_recursive(db, pred_id, blocker_candidate_id, visited):
                return True
                
        # Fallback to old blocked_by_ids
        res = await db.execute(select(Task.blocked_by_ids).filter(Task.id == item_id))
        row = res.first()
        if row and row[0]:
            for b_id in row[0]:
                if await self.is_blocked_by_recursive(db, b_id, blocker_candidate_id, visited):
                    return True
        return False

    async def check_for_active_blockers(self, db: AsyncSession, item_id: UUID) -> List[str]:
        active_blocker_titles = []
        
        from app.models.dependency import Dependency
        res = await db.execute(
            select(Task)
            .join(Dependency, Task.id == Dependency.predecessor_id)
            .filter(Dependency.successor_id == item_id)
        )
        tasks = res.scalars().all()
        for t in tasks:
            if t.status != Status.DONE:
                active_blocker_titles.append(t.title)
        
        # Check legacy field
        res = await db.execute(select(Task.blocked_by_ids).filter(Task.id == item_id))
        row = res.first()
        if row and row[0]:
            for b_id in row[0]:
                res = await db.execute(select(Task).filter(Task.id == b_id))
                obj = res.scalars().first()
                if obj and obj.status != Status.DONE:
                    if obj.title not in active_blocker_titles:
                        active_blocker_titles.append(obj.title)
                        
        return active_blocker_titles

    @atomic
    async def create(self, db: AsyncSession, *, obj_in: TaskCreate, owner_id: Optional[UUID] = None) -> Task:
        obj_data = clean_dict_datetimes(obj_in.dict(exclude_unset=True, exclude={'topic_ids', 'type_ids'}))
        assignee_ids = obj_data.pop("assignee_ids", [])
        subtasks_data = obj_data.pop("subtasks", [])
        
        topic_ids = getattr(obj_in, 'topic_ids', [])
        type_ids = getattr(obj_in, 'type_ids', [])
        
        # 1. Bidirectional Date/Duration logic
        from datetime import timedelta
        start = obj_data.get("start_date")
        due = obj_data.get("due_date")
        dur = obj_data.get("duration_days")

        if start and dur and dur > 0 and not due:
            # Calculate due from start + dur (dur=1 means same day)
            obj_data["due_date"] = start + timedelta(days=dur - 1)
        elif start and due and not dur:
            # Calculate dur from start/due
            obj_data["duration_days"] = (due - start).days + 1
        elif due and dur and dur > 0 and not start:
            # Calculate start from due - dur
            obj_data["start_date"] = due - timedelta(days=dur - 1)
        elif start and due and dur:
            # All 3 provided: prioritize duration to keep sync
            obj_data["due_date"] = start + timedelta(days=dur - 1)

        # Status logic: set completed_at if created as DONE and not provided
        if obj_data.get("status") == Status.DONE and not obj_data.get("completed_at"):
            obj_data["completed_at"] = datetime.utcnow()
        
        # Calculate next sort_index
        if "sort_index" not in obj_data:
            query = select(self.model.sort_index).filter(self.model.parent_id == obj_data.get("parent_id"))
            if obj_data.get("project_id"):
                query = query.filter(self.model.project_id == obj_data["project_id"])
            else:
                query = query.filter(self.model.project_id == None)
                
            result = await db.execute(
                query.order_by(self.model.sort_index.desc()).limit(1)
            )
            max_idx = result.scalar()
            obj_data["sort_index"] = (max_idx or 0) + 10
            
        db_obj = self.model(**obj_data)
        if owner_id:
            db_obj.owner_id = owner_id
        
        if assignee_ids:
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(assignee_ids)))
            db_obj.assignees = res.scalars().all()

        if topic_ids:
            res = await db.execute(select(Topic).filter(Topic.id.in_(topic_ids)))
            db_obj.topics = res.scalars().all()
            
        if type_ids:
            res = await db.execute(select(WorkType).filter(WorkType.id.in_(type_ids)))
            db_obj.types = res.scalars().all()

        db.add(db_obj)
        await commit(db)
        await db.refresh(db_obj)
        
        # Handle recursive subtasks
        if subtasks_data:
            for st_data in subtasks_data:
                # Recursively call create? 
                # Better to use a simpler loop for TaskShortCreate
                st_create = TaskCreate(
                    project_id=db_obj.project_id,
                    parent_id=db_obj.id,
                    owner_id=db_obj.owner_id,
                    **st_data
                )
                await self.create(db, obj_in=st_create)
        
        if db_obj.parent_id:
            await self.update_parent_status_recursive(db, db_obj.parent_id)
        
        await self.sync_project_from_tasks(db, db_obj.project_id)
            
        if assignee_ids:
            await self.notify_assignees(db, db_obj.id, assignee_ids, db_obj.title)

        # Automations / project webhooks react after the task is safely written; they never fail this call.
        task_id = db_obj.id  # read now: a rolled-back rule SAVEPOINT expires the instance
        await fire_task_events(
            db, task_id=task_id, project_id=db_obj.project_id, created=True,
            new_status=_enum_val(db_obj.status), added_assignees=assignee_ids,
        )

        # Refetch to get all relationships loaded
        return await self.get(db, task_id)

    async def notify_assignees(self, db: AsyncSession, item_id: UUID, user_ids: List[UUID], item_title: str):
        # Refetch or use db_obj if available to get project_id
        res = await db.execute(select(Task.project_id).filter(Task.id == item_id))
        project_id = res.scalar()
        
        from app.crud.crud_notification import notification as notification_crud
        from app.schemas.notification import NotificationCreate
        
        link = f"/projects/{project_id}?task_id={item_id}" if project_id else f"/tasks?task_id={item_id}"
        
        for user_id in user_ids:
            await notification_crud.create(
                db,
                obj_in=NotificationCreate(
                    user_id=user_id,
                    title="New Assignment",
                    message=f"You have been assigned to task '{item_title}'.",
                    type="assignment",
                    link=link
                )
            )

        await self._email_assignees(db, project_id, user_ids, item_title, link)

    async def _email_assignees(self, db: AsyncSession, project_id, user_ids: List[UUID], item_title: str, link: str):
        """Queue an assignment e-mail for every assignee who is active and has not opted out."""
        import logging

        try:
            from app.core.mailer import absolute_url, enqueue_email
            from app.models.project import Project
            from app.models.user import User

            # SAVEPOINT: a failure here must only undo the e-mails, never the surrounding task change
            async with db.begin_nested():
                users = (
                    await db.execute(
                        select(User).where(
                            User.id.in_(user_ids), User.is_active == True, User.notify_email_assignments == True  # noqa: E712
                        )
                    )
                ).scalars().all()
                project_name = None
                if users and project_id:
                    project_name = (await db.execute(select(Project.name).where(Project.id == project_id))).scalar()
                for user in users:
                    await enqueue_email(
                        db,
                        to=user.email,
                        kind="assignment",
                        template="assignment",
                        name=user.full_name or user.email,
                        task_title=item_title,
                        project_name=project_name,
                        link=absolute_url(link),
                    )
            await commit(db)
        except Exception:  # an e-mail problem must never break assigning a task
            logging.getLogger(__name__).exception("Could not queue assignment e-mails")

    @atomic
    async def update(
        self, db: AsyncSession, *, db_obj: Task, obj_in: Union[TaskUpdate, Dict[str, Any]]
    ) -> Task:
        # Capture IDs early to avoid lazy-loading issues during async operations
        project_id = db_obj.project_id
        old_parent_id = db_obj.parent_id
        old_status = _enum_val(db_obj.status)
        added_assignee_ids: List[UUID] = []
        
        if isinstance(obj_in, TaskUpdate):
            obj_data = obj_in.dict(exclude_unset=True)
        else:
            obj_data = obj_in.copy()
        
        # Extract fields handled manually
        new_assignee_ids = obj_data.pop("assignee_ids", None)
        new_topic_ids = obj_data.pop("topic_ids", None)
        new_type_ids = obj_data.pop("type_ids", None)
        new_blocker_ids = obj_data.pop("blocked_by_ids", None)
        subtasks_data = obj_data.pop("subtasks", [])

        # 1. Clean data and naivify dates
        obj_data = clean_dict_datetimes(obj_data)
        
        # 2. Bidirectional Date/Duration logic
        reconcile_dates(obj_data, db_obj.start_date, db_obj.due_date, db_obj.duration_days)

        # 3. Status logic: check blockers ONLY if moving TO Done
        if obj_data.get("status") == Status.DONE and db_obj.status != Status.DONE:
            active_blockers = await self.check_for_active_blockers(db, db_obj.id)
            if active_blockers:
                raise ValueError(f"Task is blocked by unfinished items: {', '.join(active_blockers)}")
            if not obj_data.get("completed_at"):
                obj_data["completed_at"] = datetime.utcnow()
        elif "status" in obj_data and obj_data["status"] != Status.DONE and db_obj.status == Status.DONE:
            # Clear completed_at if moving away from DONE
            obj_data["completed_at"] = None

        # 4. Dependency Logic: prevent circularity
        if new_blocker_ids is not None:
            for b_id in new_blocker_ids:
                if b_id == db_obj.id:
                    raise ValueError("Item cannot block itself")
                if await self.is_blocked_by_recursive(db, b_id, db_obj.id, set()):
                    raise ValueError(f"Circular dependency detected with item ID: {b_id}")
            db_obj.blocked_by_ids = new_blocker_ids

        # 5. M2M Relationships: Assignees
        if new_assignee_ids is not None:
            current_ids = [u.id for u in db_obj.assignees]
            added_ids = [uid for uid in new_assignee_ids if uid not in current_ids]
            
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(new_assignee_ids)))
            db_obj.assignees = res.scalars().all()
            
            if added_ids:
                added_assignee_ids = added_ids
                await self.notify_assignees(db, db_obj.id, added_ids, db_obj.title)

        # 6. M2M Relationships: Topics & Types
        if new_topic_ids is not None:
            res = await db.execute(select(Topic).filter(Topic.id.in_(new_topic_ids)))
            db_obj.topics = res.scalars().all()
                
        if new_type_ids is not None:
            res = await db.execute(select(WorkType).filter(WorkType.id.in_(new_type_ids)))
            db_obj.types = res.scalars().all()

        # 7. Parent circularity check
        if "parent_id" in obj_data and obj_data["parent_id"] is not None:
            new_p_id = UUID(str(obj_data["parent_id"]))
            if new_p_id == db_obj.id:
                raise ValueError("A task cannot be its own parent")
            
            async def is_descendant(parent_candidate_id: UUID, task_id: UUID) -> bool:
                res = await db.execute(select(self.model.id).filter(self.model.parent_id == task_id))
                children_ids = res.scalars().all()
                for c_id in children_ids:
                    if c_id == parent_candidate_id or await is_descendant(parent_candidate_id, c_id):
                        return True
                return False
            
            if await is_descendant(new_p_id, db_obj.id):
                raise ValueError("Cannot set a descendant as a parent (circular hierarchy)")

        # 8. Call base update for remaining fields
        db_obj = await super().update(db, db_obj=db_obj, obj_in=obj_data)
        
        # 9. Post-update bubbles
        if old_parent_id:
            await self.update_parent_status_recursive(db, old_parent_id)
        if db_obj.parent_id and db_obj.parent_id != old_parent_id:
            await self.update_parent_status_recursive(db, db_obj.parent_id)
        
        # 10. Handle recursive subtasks
        if subtasks_data:
            for st_data in subtasks_data:
                st_create = TaskCreate(
                    project_id=db_obj.project_id,
                    parent_id=db_obj.id,
                    owner_id=db_obj.owner_id,
                    **st_data
                )
                await self.create(db, obj_in=st_create)

        await self.sync_project_from_tasks(db, project_id)

        task_id = db_obj.id  # read now: a rolled-back rule SAVEPOINT expires the instance
        if old_status != "Done" and _enum_val(db_obj.status) == "Done" and db_obj.recurrence_rule:
            await self._spawn_next_occurrence(db, db_obj)
        await fire_task_events(
            db, task_id=task_id, project_id=db_obj.project_id,
            old_status=old_status, new_status=_enum_val(db_obj.status), added_assignees=added_assignee_ids,
        )

        return await self.get(db, task_id)

    async def _spawn_next_occurrence(self, db: AsyncSession, done: Task) -> Optional[Task]:
        """Create the next copy of a recurring task that was just completed (same unit of work as the completion).

        Dates move by the distance between the old and the new anchor date. Subtasks are not copied; the checklist is
        reset; assignees, taxonomy and custom values carry over. A rule that has run out (UNTIL) simply stops.
        """
        import logging

        from app.core.recurrence import RecurrenceError, next_occurrence

        completed = done.completed_at or datetime.utcnow()
        base = done.due_date or done.start_date or completed.replace(hour=0, minute=0, second=0, microsecond=0)
        try:
            nxt = next_occurrence(done.recurrence_rule, base, not_before=completed)
        except RecurrenceError:
            logging.getLogger(__name__).warning("Task %s has an unusable recurrence rule %r", done.id, done.recurrence_rule)
            return None
        if nxt is None:
            return None
        delta = nxt - base

        def shift(d):
            return d + delta if d else None

        fresh_checklist = [{**item, "is_done": False} for item in (done.checklist or []) if isinstance(item, dict)]
        data = dict(
            title=done.title, description=done.description, project_id=done.project_id, parent_id=done.parent_id,
            color=done.color, topic=done.topic, type=done.type, topic_id=done.topic_id, type_id=done.type_id,
            priority=done.priority, is_milestone=done.is_milestone, status=Status.TODO,
            start_date=shift(done.start_date), due_date=shift(done.due_date) if done.due_date else nxt,
            deadline_at=shift(done.deadline_at), duration_days=done.duration_days,
            tags=list(done.tags or []), budget=done.budget, risk_probability=done.risk_probability,
            risk_impact=done.risk_impact, optimistic_days=done.optimistic_days, normal_days=done.normal_days,
            pessimistic_days=done.pessimistic_days, checklist=fresh_checklist, recurrence_rule=done.recurrence_rule,
            custom_values=dict(done.custom_values or {}),
            assignee_ids=[u.id for u in (done.assignees or [])],
            topic_ids=[t.id for t in (done.topics or [])], type_ids=[t.id for t in (done.types or [])],
        )
        return await self.create(db, obj_in=TaskCreate(**data), owner_id=done.owner_id)

    @atomic
    async def update_assignees(self, db: AsyncSession, *, task_id: UUID, user_ids: List[UUID]) -> Task:
        db_obj = await self.get(db, id=task_id)
        if not db_obj:
            return None
        
        current_ids = [u.id for u in db_obj.assignees]
        added_ids = [uid for uid in user_ids if uid not in current_ids]
        
        from app.models.user import User
        res = await db.execute(select(User).filter(User.id.in_(user_ids)))
        db_obj.assignees = res.scalars().all()
        
        if added_ids:
            await self.notify_assignees(db, db_obj.id, added_ids, db_obj.title)
            
        db.add(db_obj)
        await commit(db)
        await db.refresh(db_obj)
        if added_ids:
            task_id = db_obj.id
            await fire_task_events(db, task_id=task_id, project_id=db_obj.project_id, added_assignees=added_ids)
            return await self.get(db, task_id)
        return db_obj

    @atomic
    async def remove(self, db: AsyncSession, *, id: UUID) -> Task:
        # Load object first to get parent/project info
        db_obj = await self.get(db, id=id)
        if not db_obj:
            return None
            
        parent_id = db_obj.parent_id
        project_id = db_obj.project_id
        
        obj = await super().remove(db, id=id)
        
        if parent_id:
            await self.update_parent_status_recursive(db, parent_id)
        
        await self.sync_project_from_tasks(db, project_id)
        return obj

task = CRUDTask(Task)
# Point subtask to task for backward compatibility during migration
subtask = task
