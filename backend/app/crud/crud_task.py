from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.crud.base import CRUDBase
from app.models.task import Task, Subtask
from app.schemas.task import TaskCreate, TaskUpdate, SubtaskCreate, SubtaskUpdate

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

task = CRUDTask(Task)
subtask = CRUDSubtask(Subtask)
