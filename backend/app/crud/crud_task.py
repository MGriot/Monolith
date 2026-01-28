from typing import List, Union, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.crud.base import CRUDBase
from app.models.task import Task, Subtask
from app.schemas.task import TaskCreate, TaskUpdate, SubtaskCreate, SubtaskUpdate
from app.core.enums import Status

class CRUDTask(CRUDBase[Task, TaskCreate, TaskUpdate]):
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
            # TODO is 0
        
        progress = float(score_sum) / total if total > 0 else 0.0
        
        project_obj = await project_crud.get(db, id=project_id)
        if project_obj:
            if abs(project_obj.progress_percent - progress) > 0.01:
                await project_crud.update(db, db_obj=project_obj, obj_in={"progress_percent": progress})

    async def create(self, db: AsyncSession, *, obj_in: TaskCreate) -> Task:
        db_obj = await super().create(db, obj_in=obj_in)
        await self.update_project_progress(db, db_obj.project_id)
        return db_obj

    async def update(
        self, db: AsyncSession, *, db_obj: Task, obj_in: Union[TaskUpdate, Dict[str, Any]]
    ) -> Task:
        db_obj = await super().update(db, db_obj=db_obj, obj_in=obj_in)
        await self.update_project_progress(db, db_obj.project_id)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: UUID) -> Task:
        obj = await super().remove(db, id=id)
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