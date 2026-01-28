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
            .options(selectinload(Task.blocking_tasks))
        )
        return result.scalars().first()

    async def get_multi_by_project(
        self, db: AsyncSession, *, project_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Task]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.project_id == project_id)
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
        
        db_obj = self.model(**obj_data)
        
        if blocker_ids:
            # Check for self-reference
            if any(b_id == db_obj.id for b_id in blocker_ids):
                raise ValueError("Task cannot block itself")
            
            result = await db.execute(select(Task).filter(Task.id.in_(blocker_ids)))
            blockers = result.scalars().all()
            db_obj.blocking_tasks = blockers

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        await self.update_project_progress(db, db_obj.project_id)
        return db_obj

    async def update(
        self, db: AsyncSession, *, db_obj: Task, obj_in: Union[TaskUpdate, Dict[str, Any]]
    ) -> Task:
        obj_data = obj_in.dict(exclude_unset=True) if isinstance(obj_in, TaskUpdate) else obj_in
        
        # 1. Handle Status Change and Blockers
        if obj_data.get("status") == Status.DONE:
            active_blockers = await self.check_for_active_blockers(db, db_obj)
            if active_blockers:
                # We could raise an error, but PRD says "Visual warning if a dependency blocks completion".
                # For backend, let's enforce it unless we want to allow it.
                # Enforcing is safer for data integrity.
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

        # 3. Standard Update
        db_obj = await super().update(db, db_obj=db_obj, obj_in=obj_data)
        
        await self.update_project_progress(db, db_obj.project_id)
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
        db_obj = await super().create(db, obj_in=obj_in)
        await self.update_parent_task_status(db, db_obj.task_id)
        return db_obj

    async def update(
        self, db: AsyncSession, *, db_obj: Subtask, obj_in: Union[SubtaskUpdate, Dict[str, Any]]
    ) -> Subtask:
        db_obj = await super().update(db, db_obj=db_obj, obj_in=obj_in)
        await self.update_parent_task_status(db, db_obj.task_id)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: UUID) -> Subtask:
        obj = await super().remove(db, id=id)
        await self.update_parent_task_status(db, obj.task_id)
        return obj

task = CRUDTask(Task)
subtask = CRUDSubtask(Subtask)