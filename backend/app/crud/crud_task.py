from typing import List, Union, Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.task import Task
from app.models.metadata import Topic, WorkType
from app.schemas.task import TaskCreate, TaskUpdate
from app.core.enums import Status
from app.core.utils import clean_dict_datetimes

class CRUDTask(CRUDBase[Task, TaskCreate, TaskUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[Task]:
        # Deep eager loading for recursive task structure (up to 3 levels)
        result = await db.execute(
            select(self.model)
            .filter(self.model.id == id)
            .options(
                selectinload(Task.owner),
                selectinload(Task.assignees),
                selectinload(Task.blocked_by),
                selectinload(Task.blocking),
                selectinload(Task.topic_ref),
                selectinload(Task.type_ref),
                selectinload(Task.topics),
                selectinload(Task.types),
                selectinload(Task.project),
                selectinload(Task.subtasks).options(
                    selectinload(Task.owner),
                    selectinload(Task.assignees),
                    selectinload(Task.blocked_by),
                    selectinload(Task.blocking),
                    selectinload(Task.topic_ref),
                    selectinload(Task.type_ref),
                    selectinload(Task.topics),
                    selectinload(Task.types),
                    selectinload(Task.subtasks).options(
                        selectinload(Task.owner),
                        selectinload(Task.assignees),
                        selectinload(Task.blocked_by),
                        selectinload(Task.blocking),
                        selectinload(Task.topic_ref),
                        selectinload(Task.type_ref),
                        selectinload(Task.topics),
                        selectinload(Task.types),
                        selectinload(Task.subtasks).options(
                            selectinload(Task.owner),
                            selectinload(Task.assignees),
                            selectinload(Task.blocked_by),
                            selectinload(Task.blocking),
                            selectinload(Task.topic_ref),
                            selectinload(Task.type_ref),
                            selectinload(Task.topics),
                            selectinload(Task.types),
                            selectinload(Task.subtasks)
                        )
                    )
                )
            )
        )
        obj = result.scalars().first()
        # Sort subtasks recursively
        def sort_recursive(task):
            if task.subtasks:
                task.subtasks.sort(key=lambda x: (x.sort_index or 0, x.created_at))
                for st in task.subtasks:
                    sort_recursive(st)
        
        if obj:
            sort_recursive(obj)
        return obj

    async def get_multi_by_project(
        self, db: AsyncSession, *, project_id: UUID, skip: int = 0, limit: int = 100, parent_id: Optional[UUID] = None
    ) -> List[Task]:
        query = select(self.model).filter(self.model.project_id == project_id)
        
        if parent_id:
            query = query.filter(self.model.parent_id == parent_id)
        else:
            # Only top-level tasks by default
            query = query.filter(self.model.parent_id == None)
            
        result = await db.execute(
            query
            .order_by(self.model.sort_index.asc(), self.model.created_at.asc())
            .options(
                selectinload(Task.owner),
                selectinload(Task.assignees),
                selectinload(Task.blocked_by),
                selectinload(Task.blocking),
                selectinload(Task.topic_ref),
                selectinload(Task.type_ref),
                selectinload(Task.topics),
                selectinload(Task.types),
                selectinload(Task.project),
                selectinload(Task.subtasks).options(
                    selectinload(Task.owner),
                    selectinload(Task.assignees),
                    selectinload(Task.blocked_by),
                    selectinload(Task.blocking),
                    selectinload(Task.topic_ref),
                    selectinload(Task.type_ref),
                    selectinload(Task.topics),
                    selectinload(Task.types),
                    selectinload(Task.subtasks).options(
                        selectinload(Task.owner),
                        selectinload(Task.assignees),
                        selectinload(Task.blocked_by),
                        selectinload(Task.blocking),
                        selectinload(Task.topic_ref),
                        selectinload(Task.type_ref),
                        selectinload(Task.topics),
                        selectinload(Task.types),
                        selectinload(Task.subtasks).options(
                            selectinload(Task.owner),
                            selectinload(Task.assignees),
                            selectinload(Task.blocked_by),
                            selectinload(Task.blocking),
                            selectinload(Task.topic_ref),
                            selectinload(Task.type_ref),
                            selectinload(Task.topics),
                            selectinload(Task.types),
                            selectinload(Task.subtasks)
                        )
                    )
                )
            )
            .offset(skip)
            .limit(limit)
        )
        tasks = result.scalars().all()
        
        def sort_recursive(task):
            if task.subtasks:
                task.subtasks.sort(key=lambda x: (x.sort_index or 0, x.created_at))
                for st in task.subtasks:
                    sort_recursive(st)

        for t in tasks:
            sort_recursive(t)
        return tasks

    async def sync_project_from_tasks(self, db: AsyncSession, project_id: UUID):
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
            if t.status == Status.DONE:
                score_sum += 100
            elif t.status == Status.REVIEW:
                score_sum += 80
            elif t.status == Status.IN_PROGRESS:
                score_sum += 50
            elif t.status == Status.ON_HOLD:
                score_sum += 25
        progress = round(float(score_sum) / total, 2) if total > 0 else 0.0

        # 2. Date aggregation
        start_dates = [t.start_date for t in all_tasks if t.start_date]
        due_dates = [t.due_date for t in all_tasks if t.due_date]
        deadline_dates = [t.deadline_at for t in all_tasks if t.deadline_at]
        
        # end_date fallback logic: use due_date or deadline_at
        effective_end_dates = due_dates + deadline_dates
        
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

    async def create(self, db: AsyncSession, *, obj_in: TaskCreate) -> Task:
        obj_data = clean_dict_datetimes(obj_in.dict(exclude_unset=True, exclude={'topic_ids', 'type_ids'}))
        assignee_ids = obj_data.pop("assignee_ids", [])
        subtasks_data = obj_data.pop("subtasks", [])
        
        topic_ids = getattr(obj_in, 'topic_ids', [])
        type_ids = getattr(obj_in, 'type_ids', [])
        
        # Status logic: set completed_at if created as DONE and not provided
        if obj_data.get("status") == Status.DONE and not obj_data.get("completed_at"):
            obj_data["completed_at"] = datetime.utcnow()
        
        # Calculate next sort_index
        if "sort_index" not in obj_data:
            result = await db.execute(
                select(self.model.sort_index)
                .filter(self.model.project_id == obj_data["project_id"])
                .filter(self.model.parent_id == obj_data.get("parent_id"))
                .order_by(self.model.sort_index.desc())
                .limit(1)
            )
            max_idx = result.scalar()
            obj_data["sort_index"] = (max_idx or 0) + 10
            
        db_obj = self.model(**obj_data)
        
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
        await db.commit()
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
            
        # Refetch to get all relationships loaded
        return await self.get(db, db_obj.id)

    async def notify_assignees(self, db: AsyncSession, item_id: UUID, user_ids: List[UUID], item_title: str):
        from app.crud.crud_notification import notification as notification_crud
        from app.schemas.notification import NotificationCreate
        
        for user_id in user_ids:
            await notification_crud.create(
                db,
                obj_in=NotificationCreate(
                    user_id=user_id,
                    title="New Assignment",
                    message=f"You have been assigned to task '{item_title}'.",
                    type="assignment",
                    link=f"/tasks/{item_id}"
                )
            )

    async def update(
        self, db: AsyncSession, *, db_obj: Task, obj_in: Union[TaskUpdate, Dict[str, Any]]
    ) -> Task:
        # Capture IDs early to avoid lazy-loading issues during async operations
        project_id = db_obj.project_id
        old_parent_id = db_obj.parent_id
        
        if isinstance(obj_in, TaskUpdate):
            obj_data = obj_in.dict(exclude_unset=True)
        else:
            obj_data = obj_in.copy()
        
        # Extract fields handled manually
        new_assignee_ids = obj_data.pop("assignee_ids", None)
        new_topic_ids = obj_data.pop("topic_ids", None)
        new_type_ids = obj_data.pop("type_ids", None)
        new_blocker_ids = obj_data.pop("blocked_by_ids", None)

        # 1. Clean data and naivify dates
        obj_data = clean_dict_datetimes(obj_data)
        
        # 2. Status logic: check blockers ONLY if moving TO Done
        if obj_data.get("status") == Status.DONE and db_obj.status != Status.DONE:
            active_blockers = await self.check_for_active_blockers(db, db_obj.id)
            if active_blockers:
                raise ValueError(f"Task is blocked by unfinished items: {', '.join(active_blockers)}")
            if not obj_data.get("completed_at"):
                obj_data["completed_at"] = datetime.utcnow()
        elif "status" in obj_data and obj_data["status"] != Status.DONE:
            if "completed_at" not in obj_data:
                obj_data["completed_at"] = None

        # 3. Dependency Logic: prevent circularity
        if new_blocker_ids is not None:
            for b_id in new_blocker_ids:
                if b_id == db_obj.id:
                    raise ValueError("Item cannot block itself")
                if await self.is_blocked_by_recursive(db, b_id, db_obj.id, set()):
                    raise ValueError(f"Circular dependency detected with item ID: {b_id}")
            db_obj.blocked_by_ids = new_blocker_ids

        # 4. M2M Relationships: Assignees
        if new_assignee_ids is not None:
            current_ids = [u.id for u in db_obj.assignees]
            added_ids = [uid for uid in new_assignee_ids if uid not in current_ids]
            
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(new_assignee_ids)))
            db_obj.assignees = res.scalars().all()
            
            if added_ids:
                await self.notify_assignees(db, db_obj.id, added_ids, db_obj.title)

        # 5. M2M Relationships: Topics & Types
        if new_topic_ids is not None:
            res = await db.execute(select(Topic).filter(Topic.id.in_(new_topic_ids)))
            db_obj.topics = res.scalars().all()
                
        if new_type_ids is not None:
            res = await db.execute(select(WorkType).filter(WorkType.id.in_(new_type_ids)))
            db_obj.types = res.scalars().all()

        # 6. Parent circularity check
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

        # 7. Call base update for remaining fields
        db_obj = await super().update(db, db_obj=db_obj, obj_in=obj_data)
        
        # 8. Post-update bubbles
        if old_parent_id:
            await self.update_parent_status_recursive(db, old_parent_id)
        if db_obj.parent_id and db_obj.parent_id != old_parent_id:
            await self.update_parent_status_recursive(db, db_obj.parent_id)
        
        await self.sync_project_from_tasks(db, project_id)
        
        return await self.get(db, db_obj.id)

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
