from typing import List, Optional, Any, Union, Dict
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.project import Project
from app.models.metadata import Topic, WorkType
from app.models.template import ProjectTemplate
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.schemas.task import TaskCreate
from app.core.utils import clean_dict_datetimes

class CRUDProject(CRUDBase[Project, ProjectCreate, ProjectUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[Project]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.id == id)
            .options(
                selectinload(Project.topic_ref),
                selectinload(Project.type_ref),
                selectinload(Project.topics),
                selectinload(Project.types),
                selectinload(Project.members),
                selectinload(Project.owner)
            )
        )
        return result.scalars().first()

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100, include_archived: bool = False
    ) -> List[Project]:
        query = select(self.model)
        if not include_archived:
            query = query.filter(self.model.is_archived == False)
            
        result = await db.execute(
            query
            .options(
                selectinload(Project.topic_ref),
                selectinload(Project.type_ref),
                selectinload(Project.topics),
                selectinload(Project.types),
                selectinload(Project.members),
                selectinload(Project.owner)
            )
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def create(self, db: AsyncSession, *, obj_in: ProjectCreate) -> Project:
        obj_data = clean_dict_datetimes(obj_in.dict(exclude={'topic_ids', 'type_ids', 'member_ids', 'template_id'}))
        db_obj = self.model(**obj_data)
        
        if obj_in.topic_ids:
            topics_result = await db.execute(select(Topic).filter(Topic.id.in_(obj_in.topic_ids)))
            db_obj.topics = topics_result.scalars().all()
            
        if obj_in.type_ids:
            types_result = await db.execute(select(WorkType).filter(WorkType.id.in_(obj_in.type_ids)))
            db_obj.types = types_result.scalars().all()

        if obj_in.member_ids:
            members_result = await db.execute(select(User).filter(User.id.in_(obj_in.member_ids)))
            db_obj.members = members_result.scalars().all()

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        # Template Instantiation
        if obj_in.template_id:
            await self._instantiate_template(db, project_id=db_obj.id, template_id=obj_in.template_id, owner_id=None)

        return await self.get(db, id=db_obj.id)

    async def create_with_owner(
        self, db: AsyncSession, *, obj_in: ProjectCreate, owner_id: UUID
    ) -> Project:
        obj_in_data = clean_dict_datetimes(obj_in.dict(exclude={'topic_ids', 'type_ids', 'member_ids', 'template_id'}))
        db_obj = self.model(**obj_in_data, owner_id=owner_id)
        
        if obj_in.topic_ids:
            topics_result = await db.execute(select(Topic).filter(Topic.id.in_(obj_in.topic_ids)))
            db_obj.topics = topics_result.scalars().all()
            
        if obj_in.type_ids:
            types_result = await db.execute(select(WorkType).filter(WorkType.id.in_(obj_in.type_ids)))
            db_obj.types = types_result.scalars().all()

        if obj_in.member_ids:
            members_result = await db.execute(select(User).filter(User.id.in_(obj_in.member_ids)))
            db_obj.members = members_result.scalars().all()
            
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)

        # Template Instantiation
        if obj_in.template_id:
            await self._instantiate_template(db, project_id=db_obj.id, template_id=obj_in.template_id, owner_id=owner_id)

        return await self.get(db, id=db_obj.id)

    async def _instantiate_template(self, db: AsyncSession, *, project_id: UUID, template_id: UUID, owner_id: Optional[UUID]) -> None:
        template = await db.get(ProjectTemplate, template_id)
        if not template:
            return

        from app.crud.crud_task import task as crud_task

        # 1. Instantiate Scoped Topics
        topic_map = {} # template_id -> new_id
        for t_preset in (template.topics_preset or []):
            new_topic = Topic(
                name=t_preset["name"],
                color=t_preset.get("color", "#64748b"),
                project_id=project_id
            )
            db.add(new_topic)
            await db.flush()
            topic_map[t_preset.get("id")] = new_topic.id

        # 2. Instantiate Scoped WorkTypes
        type_map = {}
        for w_preset in (template.work_types_preset or []):
            new_type = WorkType(
                name=w_preset["name"],
                color=w_preset.get("color", "#64748b"),
                icon=w_preset.get("icon"),
                project_id=project_id
            )
            db.add(new_type)
            await db.flush()
            type_map[w_preset.get("id")] = new_type.id

        # 3. Instantiate Hierarchical Tasks
        async def create_recursive_tasks(tasks_data, parent_id=None):
            for t_data in tasks_data:
                # Resolve topic/type from maps if they match template IDs
                t_topic_id = topic_map.get(t_data.get("topic_id"))
                t_type_id = type_map.get(t_data.get("type_id"))
                
                # If not in map, maybe it's already a real UUID (global)
                if not t_topic_id and t_data.get("topic_id"):
                    try: t_topic_id = UUID(t_data["topic_id"])
                    except: pass
                if not t_type_id and t_data.get("type_id"):
                    try: t_type_id = UUID(t_data["type_id"])
                    except: pass

                task_in = TaskCreate(
                    title=t_data["title"],
                    description=t_data.get("description"),
                    status=t_data.get("status", "Todo"),
                    priority=t_data.get("priority", "Medium"),
                    project_id=project_id,
                    parent_id=parent_id,
                    topic_id=t_topic_id,
                    type_id=t_type_id,
                    is_milestone=t_data.get("is_milestone", False),
                    sort_index=t_data.get("sort_index", 0)
                )
                
                new_task = await crud_task.create(db, obj_in=task_in, owner_id=owner_id)
                
                if t_data.get("subtasks"):
                    await create_recursive_tasks(t_data["subtasks"], parent_id=new_task.id)

        if template.tasks_json:
            await create_recursive_tasks(template.tasks_json)
        
        await db.commit()

    async def update(
        self, db: AsyncSession, *, db_obj: Project, obj_in: Union[ProjectUpdate, Dict[str, Any]]
    ) -> Project:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.dict(exclude_unset=True)
            
        # Handle many-to-many topics
        if "topic_ids" in update_data:
            topic_ids = update_data.pop("topic_ids")
            if topic_ids:
                topics_result = await db.execute(select(Topic).filter(Topic.id.in_(topic_ids)))
                db_obj.topics = topics_result.scalars().all()
            else:
                db_obj.topics = []
                
        # Handle many-to-many types
        if "type_ids" in update_data:
            type_ids = update_data.pop("type_ids")
            if type_ids:
                types_result = await db.execute(select(WorkType).filter(WorkType.id.in_(type_ids)))
                db_obj.types = types_result.scalars().all()
            else:
                db_obj.types = []

        # Handle many-to-many members
        if "member_ids" in update_data:
            member_ids = update_data.pop("member_ids")
            if member_ids:
                members_result = await db.execute(select(User).filter(User.id.in_(member_ids)))
                db_obj.members = members_result.scalars().all()
            else:
                db_obj.members = []

        return await super().update(db, db_obj=db_obj, obj_in=update_data)

    async def get_multi_by_owner(
        self, db: AsyncSession, *, owner_id: UUID, skip: int = 0, limit: int = 100, include_archived: bool = False
    ) -> List[Project]:
        query = select(self.model).filter(self.model.owner_id == owner_id)
        if not include_archived:
            query = query.filter(self.model.is_archived == False)
            
        result = await db.execute(
            query
            .options(
                selectinload(Project.topic_ref),
                selectinload(Project.type_ref),
                selectinload(Project.topics),
                selectinload(Project.types),
                selectinload(Project.members),
                selectinload(Project.owner)
            )
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def get_multi_by_user(
        self, db: AsyncSession, *, user_id: UUID, skip: int = 0, limit: int = 100, include_archived: bool = False
    ) -> List[Project]:
        """
        Fetch projects where the user is either the owner OR a member.
        """
        from sqlalchemy import or_
        from app.models.associations import project_members
        
        # We use a subquery or a join to check for membership
        query = (
            select(self.model)
            .outerjoin(project_members)
            .filter(
                or_(
                    self.model.owner_id == user_id,
                    project_members.c.user_id == user_id
                )
            )
        )
        
        if not include_archived:
            query = query.filter(self.model.is_archived == False)
            
        query = (
            query.distinct()
            .options(
                selectinload(Project.topic_ref),
                selectinload(Project.type_ref),
                selectinload(Project.topics),
                selectinload(Project.types),
                selectinload(Project.members),
                selectinload(Project.owner)
            )
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        return result.scalars().all()

project = CRUDProject(Project)
