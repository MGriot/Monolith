from typing import List, Union, Dict, Any, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.task import Task, Subtask, task_dependencies
from app.schemas.task import TaskCreate, TaskUpdate, SubtaskCreate, SubtaskUpdate
from app.core.enums import Status

class CRUDTask(CRUDBase[Task, TaskCreate, TaskUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[Task]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.id == id)
            .options(
                selectinload(Task.blocking_tasks),
                selectinload(Task.assignees)
            )
        )
        return result.scalars().first()

    async def get_multi_by_project(
        self, db: AsyncSession, *, project_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Task]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.project_id == project_id)
            .options(selectinload(Task.assignees))
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def update_project_progress(self, db: AsyncSession, project_id: UUID):
        # Prevent circular import at module level
        from app.crud.crud_project import project as project_crud
        
        tasks = await self.get_multi_by_project(db, project_id=project_id, limit=1000)
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

    async def is_blocked_by_recursive(self, db: AsyncSession, task_id: UUID, blocker_candidate_id: UUID, visited: set) -> bool:
        if task_id == blocker_candidate_id:
            return True
        if task_id in visited:
            return False
        visited.add(task_id)
        
        result = await db.execute(
            select(task_dependencies.c.blocker_id).filter(task_dependencies.c.blocked_id == task_id)
        )
        blocker_ids = result.scalars().all()
        for b_id in blocker_ids:
            if await self.is_blocked_by_recursive(db, b_id, blocker_candidate_id, visited):
                return True
        return False

    async def check_for_active_blockers(self, db: AsyncSession, task_obj: Task) -> List[str]:
        # Refresh/ensure blocking_tasks are loaded
        result = await db.execute(
            select(Task).filter(Task.id == task_obj.id).options(selectinload(Task.blocking_tasks))
        )
        task_with_deps = result.scalars().first()
        active_blockers = [t.title for t in task_with_deps.blocking_tasks if t.status != Status.DONE]
        return active_blockers

    async def create(self, db: AsyncSession, *, obj_in: TaskCreate) -> Task:
        obj_data = obj_in.dict(exclude_unset=True)
        blocker_ids = obj_data.pop("blocked_by_ids", [])
        assignee_ids = obj_data.pop("assignee_ids", [])
        
        db_obj = self.model(**obj_data)
        
        if blocker_ids:
            # Check for self-reference
            if any(b_id == db_obj.id for b_id in blocker_ids):
                raise ValueError("Task cannot block itself")
            
            result = await db.execute(select(Task).filter(Task.id.in_(blocker_ids)))
            blockers = result.scalars().all()
            db_obj.blocking_tasks = blockers

        if assignee_ids:
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(assignee_ids)))
            users = res.scalars().all()
            db_obj.assignees = users

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        await self.update_project_progress(db, db_obj.project_id)
        if assignee_ids:
            await self.notify_assignees(db, db_obj.id, assignee_ids, db_obj.title)
            
        return db_obj

    async def notify_unblocked_tasks(self, db: AsyncSession, task_obj: Task):
        from app.crud.crud_notification import notification as notification_crud
        from app.schemas.notification import NotificationCreate
        
        # Reload blocking_tasks to be sure (though selectinload should have it)
        result = await db.execute(
            select(Task).filter(Task.id == task_obj.id).options(selectinload(Task.blocked_tasks).selectinload(Task.blocking_tasks))
        )
        task_refreshed = result.scalars().first()
        
        for blocked_task in task_refreshed.blocked_tasks:
            # Check if this task is now completely unblocked
            active_blockers = await self.check_for_active_blockers(db, blocked_task)
            if not active_blockers:
                # Notify all assignees of the blocked task
                # First, ensure assignees are loaded
                res = await db.execute(select(Task).filter(Task.id == blocked_task.id).options(selectinload(Task.assignees)))
                bt_with_assignees = res.scalars().first()
                
                for user in bt_with_assignees.assignees:
                    await notification_crud.create(
                        db,
                        obj_in=NotificationCreate(
                            user_id=user.id,
                            title="Task Unblocked",
                            message=f"Task '{blocked_task.title}' is now unblocked as '{task_obj.title}' was completed.",
                            type="unblocked",
                            link=f"/tasks/{blocked_task.id}"
                        )
                    )

    async def notify_assignees(self, db: AsyncSession, task_id: UUID, new_assignee_ids: List[UUID], item_title: str, is_subtask: bool = False):
        from app.crud.crud_notification import notification as notification_crud
        from app.schemas.notification import NotificationCreate
        
        link = f"/tasks/{task_id}" if not is_subtask else f"/subtasks/{task_id}"
        item_type = "Task" if not is_subtask else "Subtask"
        
        for user_id in new_assignee_ids:
            await notification_crud.create(
                db,
                obj_in=NotificationCreate(
                    user_id=user_id,
                    title=f"New Assignment: {item_type}",
                    message=f"You have been assigned to {item_type.lower()} '{item_title}'.",
                    type="assignment",
                    link=link
                )
            )

    async def update(
        self, db: AsyncSession, *, db_obj: Task, obj_in: Union[TaskUpdate, Dict[str, Any]]
    ) -> Task:
        obj_data = obj_in.dict(exclude_unset=True) if isinstance(obj_in, TaskUpdate) else obj_in
        
        old_status = db_obj.status
        
        # 1. Handle Status Change and Blockers
        if obj_data.get("status") == Status.DONE:
            active_blockers = await self.check_for_active_blockers(db, db_obj)
            if active_blockers:
                raise ValueError(f"Task is blocked by unfinished tasks: {', '.join(active_blockers)}")

        # 2. Handle Dependency Updates
        if "blocked_by_ids" in obj_data:
            new_blocker_ids = obj_data.pop("blocked_by_ids")
            
            # Check for cycles
            for b_id in new_blocker_ids:
                if b_id == db_obj.id:
                    raise ValueError("Task cannot block itself")
                # If we add b_id -> blocks -> db_obj.id, we must check if db_obj.id already blocks b_id
                # So we check: is b_id blocked by db_obj.id recursively?
                if await self.is_blocked_by_recursive(db, b_id, db_obj.id, set()):
                    raise ValueError(f"Circular dependency detected with task ID: {b_id}")

            result = await db.execute(select(Task).filter(Task.id.in_(new_blocker_ids)))
            blockers = result.scalars().all()
            db_obj.blocking_tasks = blockers

        # 3. Handle Assignee Updates
        if "assignee_ids" in obj_data:
            new_assignee_ids = obj_data.pop("assignee_ids")
            # Simple approach: find added assignees to notify
            current_assignee_ids = [u.id for u in db_obj.assignees]
            added_ids = [uid for uid in new_assignee_ids if uid not in current_assignee_ids]
            
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(new_assignee_ids)))
            users = res.scalars().all()
            db_obj.assignees = users
            
            if added_ids:
                await self.notify_assignees(db, db_obj.id, added_ids, db_obj.title)

        # 4. Standard Update
        db_obj = await super().update(db, db_obj=db_obj, obj_in=obj_data)
        
        # 4. Propagation & Notifications
        await self.update_project_progress(db, db_obj.project_id)
        
        if db_obj.status == Status.DONE and old_status != Status.DONE:
            await self.notify_unblocked_tasks(db, db_obj)
            
        return db_obj

    async def remove(self, db: AsyncSession, *, id: UUID) -> Task:
        obj = await super().remove(db, id=id)
        if obj:
            await self.update_project_progress(db, obj.project_id)
        return obj

class CRUDSubtask(CRUDBase[Subtask, SubtaskCreate, SubtaskUpdate]):
    async def get_multi_by_task(
        self, db: AsyncSession, *, task_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Subtask]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.task_id == task_id)
            .options(selectinload(Subtask.assignees))
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def update_parent_task_status(self, db: AsyncSession, task_id: UUID):
        subtasks = await self.get_multi_by_task(db, task_id=task_id, limit=1000)
        if not subtasks:
            return

        total = len(subtasks)
        done_count = sum(1 for s in subtasks if s.status == Status.DONE)
        in_progress_count = sum(1 for s in subtasks if s.status in [Status.IN_PROGRESS, Status.REVIEW])
        
        new_status = Status.TODO
        if done_count == total:
            new_status = Status.DONE
        elif in_progress_count > 0 or done_count > 0:
            new_status = Status.IN_PROGRESS
        
        task_obj = await task.get(db, id=task_id)
        if task_obj and task_obj.status != new_status:
            await task.update(db, db_obj=task_obj, obj_in={"status": new_status})

    async def create(self, db: AsyncSession, *, obj_in: SubtaskCreate) -> Subtask:
        obj_data = obj_in.dict(exclude_unset=True)
        assignee_ids = obj_data.pop("assignee_ids", [])
        
        db_obj = self.model(**obj_data)
        
        if assignee_ids:
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(assignee_ids)))
            users = res.scalars().all()
            db_obj.assignees = users

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        await self.update_parent_task_status(db, db_obj.task_id)
        
        if assignee_ids:
            await task.notify_assignees(db, db_obj.id, assignee_ids, db_obj.title, is_subtask=True)
            
        return db_obj

    async def update(
        self, db: AsyncSession, *, db_obj: Subtask, obj_in: Union[SubtaskUpdate, Dict[str, Any]]
    ) -> Subtask:
        obj_data = obj_in.dict(exclude_unset=True) if isinstance(obj_in, SubtaskUpdate) else obj_in
        
        if "assignee_ids" in obj_data:
            new_assignee_ids = obj_data.pop("assignee_ids")
            current_assignee_ids = [u.id for u in db_obj.assignees]
            added_ids = [uid for uid in new_assignee_ids if uid not in current_assignee_ids]
            
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(new_assignee_ids)))
            users = res.scalars().all()
            db_obj.assignees = users
            
            if added_ids:
                await task.notify_assignees(db, db_obj.id, added_ids, db_obj.title, is_subtask=True)

        db_obj = await super().update(db, db_obj=db_obj, obj_in=obj_data)
        await self.update_parent_task_status(db, db_obj.task_id)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: UUID) -> Subtask:
        obj = await super().remove(db, id=id)
        await self.update_parent_task_status(db, obj.task_id)
        return obj

task = CRUDTask(Task)
subtask = CRUDSubtask(Subtask)