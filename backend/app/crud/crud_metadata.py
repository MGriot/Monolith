from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_
from app.crud.base import CRUDBase
from app.models.metadata import Topic, WorkType
from app.schemas.metadata import TopicCreate, TopicUpdate, WorkTypeCreate, WorkTypeUpdate

class CRUDTopic(CRUDBase[Topic, TopicCreate, TopicUpdate]):
    async def get_multi_scoped(
        self, 
        db: AsyncSession, 
        *, 
        skip: int = 0, 
        limit: int = 100,
        project_id: Optional[UUID] = None,
        task_id: Optional[UUID] = None,
        include_global: bool = True
    ) -> List[Topic]:
        filters = []
        
        if project_id and task_id:
            # Strictly for a specific task in a project
            scope_filter = and_(self.model.project_id == project_id, self.model.task_id == task_id)
        elif project_id:
            # For a project (includes project-level topics)
            scope_filter = and_(self.model.project_id == project_id, self.model.task_id == None)
        elif task_id:
            # This case is rare but possible: topic only for a task regardless of project
            scope_filter = self.model.task_id == task_id
        else:
            # Only global if no IDs provided
            scope_filter = and_(self.model.project_id == None, self.model.task_id == None)

        if include_global and (project_id or task_id):
            # Include global items if specifically requested alongside a scope
            global_filter = and_(self.model.project_id == None, self.model.task_id == None)
            filters.append(or_(scope_filter, global_filter))
        else:
            filters.append(scope_filter)

        result = await db.execute(
            select(self.model)
            .filter(*filters)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

class CRUDWorkType(CRUDBase[WorkType, WorkTypeCreate, WorkTypeUpdate]):
    async def get_multi_scoped(
        self, 
        db: AsyncSession, 
        *, 
        skip: int = 0, 
        limit: int = 100,
        project_id: Optional[UUID] = None,
        task_id: Optional[UUID] = None,
        include_global: bool = True
    ) -> List[WorkType]:
        filters = []
        
        if project_id and task_id:
            scope_filter = and_(self.model.project_id == project_id, self.model.task_id == task_id)
        elif project_id:
            scope_filter = and_(self.model.project_id == project_id, self.model.task_id == None)
        elif task_id:
            scope_filter = self.model.task_id == task_id
        else:
            scope_filter = and_(self.model.project_id == None, self.model.task_id == None)

        if include_global and (project_id or task_id):
            global_filter = and_(self.model.project_id == None, self.model.task_id == None)
            filters.append(or_(scope_filter, global_filter))
        else:
            filters.append(scope_filter)

        result = await db.execute(
            select(self.model)
            .filter(*filters)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

topic = CRUDTopic(Topic)
work_type = CRUDWorkType(WorkType)

