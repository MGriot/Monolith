from typing import List, Union, Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate
from app.core.enums import Status
from app.core.utils import clean_dict_datetimes

class CRUDTask(CRUDBase[Task, TaskCreate, TaskUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[Task]:
        # Using a recursive loader or just loading immediate children
        # For full tree, we might need a recursive CTE or just load levels as needed.
        # But for 'get' by ID, we usually want the task and its immediate subtasks.
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
                selectinload(Task.subtasks).options(
                    selectinload(Task.owner),
                    selectinload(Task.assignees),
                    selectinload(Task.blocked_by),
                    selectinload(Task.blocking),
                    selectinload(Task.topic_ref),
                    selectinload(Task.type_ref)
                )
            )
        )
        obj = result.scalars().first()
        if obj and obj.subtasks:
            obj.subtasks.sort(key=lambda x: (x.sort_index or 0, x.created_at))
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
                selectinload(Task.subtasks).options(
                    selectinload(Task.owner),
                    selectinload(Task.assignees),
                    selectinload(Task.blocked_by),
                    selectinload(Task.blocking),
                    selectinload(Task.topic_ref),
                    selectinload(Task.type_ref),
                    selectinload(Task.subtasks).options(
                        selectinload(Task.owner),
                        selectinload(Task.assignees),
                        selectinload(Task.blocked_by),
                        selectinload(Task.blocking),
                        selectinload(Task.topic_ref),
                        selectinload(Task.type_ref),
                        selectinload(Task.subtasks).options(
                            selectinload(Task.owner),
                            selectinload(Task.assignees),
                            selectinload(Task.blocked_by),
                            selectinload(Task.blocking),
                            selectinload(Task.topic_ref),
                            selectinload(Task.type_ref),
                            selectinload(Task.subtasks).options(
                                 selectinload(Task.owner),
                                 selectinload(Task.assignees),
                                 selectinload(Task.blocked_by),
                                 selectinload(Task.blocking),
                                 selectinload(Task.topic_ref),
                                 selectinload(Task.type_ref),
                                 selectinload(Task.subtasks).options(
                                     selectinload(Task.owner),
                                     selectinload(Task.assignees),
                                     selectinload(Task.blocked_by),
                                     selectinload(Task.blocking),
                                     selectinload(Task.topic_ref),
                                     selectinload(Task.type_ref),
                                     selectinload(Task.subtasks)
                                 )
                            )
                        )
                    )
                )
            )
            .offset(skip)
            .limit(limit)
        )
        tasks = result.scalars().all()
        for t in tasks:
            if t.subtasks:
                t.subtasks.sort(key=lambda x: (x.sort_index or 0, x.created_at))
        return tasks

    async def update_project_progress(self, db: AsyncSession, project_id: UUID):
        from app.crud.crud_project import project as project_crud
        
        # Get only top-level tasks for the project to calculate overall progress
        tasks = await self.get_multi_by_project(db, project_id=project_id, limit=1000, parent_id=None)
        if not tasks:
            return

        total = len(tasks)
        score_sum = 0
        for t in tasks:
            if t.status == Status.DONE:
                score_sum += 100
            elif t.status in [Status.IN_PROGRESS, Status.REVIEW]:
                score_sum += 50
        
        progress = float(score_sum) / total if total > 0 else 0.0
        
        project_obj = await project_crud.get(db, id=project_id)
        if project_obj:
            if abs(project_obj.progress_percent - progress) > 0.01:
                await project_crud.update(db, db_obj=project_obj, obj_in={"progress_percent": progress})

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
        obj_data = clean_dict_datetimes(obj_in.dict(exclude_unset=True))
        assignee_ids = obj_data.pop("assignee_ids", [])
        subtasks_data = obj_data.pop("subtasks", [])
        
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
        else:
            await self.update_project_progress(db, db_obj.project_id)
            
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
        parent_id = db_obj.parent_id
        
        if isinstance(obj_in, TaskUpdate):
            obj_data = clean_dict_datetimes(obj_in.dict(exclude_unset=True))
        else:
            obj_data = clean_dict_datetimes(obj_in)
        
        if obj_data.get("status") == Status.DONE:
            active_blockers = await self.check_for_active_blockers(db, db_obj.id)
            if active_blockers:
                raise ValueError(f"Task is blocked by unfinished items: {', '.join(active_blockers)}")
            if db_obj.status != Status.DONE:
                obj_data["completed_at"] = datetime.utcnow()
        elif "status" in obj_data and obj_data["status"] != Status.DONE:
            obj_data["completed_at"] = None

        if "blocked_by_ids" in obj_data:
            new_blocker_ids = obj_data["blocked_by_ids"]
            for b_id in new_blocker_ids:
                if b_id == db_obj.id:
                    raise ValueError("Item cannot block itself")
                if await self.is_blocked_by_recursive(db, b_id, db_obj.id, set()):
                    raise ValueError(f"Circular dependency detected with item ID: {b_id}")

        if "assignee_ids" in obj_data:
            new_assignee_ids = obj_data.pop("assignee_ids")
            current_ids = [u.id for u in db_obj.assignees]
            added_ids = [uid for uid in new_assignee_ids if uid not in current_ids]
            
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(new_assignee_ids)))
            db_obj.assignees = res.scalars().all()
            
            if added_ids:
                await self.notify_assignees(db, db_obj.id, added_ids, db_obj.title)

        db_obj = await super().update(db, db_obj=db_obj, obj_in=obj_data)
        
        if parent_id:
            await self.update_parent_status_recursive(db, parent_id)
        
        await self.update_project_progress(db, project_id)
        
        # Refetch to get all relationships loaded
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
        
        await self.update_project_progress(db, project_id)
        return obj

task = CRUDTask(Task)
# Point subtask to task for backward compatibility during migration
subtask = task