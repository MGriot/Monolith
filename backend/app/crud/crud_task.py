from typing import List, Union, Dict, Any, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.task import Task, Subtask
from app.schemas.task import TaskCreate, TaskUpdate, SubtaskCreate, SubtaskUpdate
from app.core.enums import Status
from app.core.utils import clean_dict_datetimes

class CRUDTask(CRUDBase[Task, TaskCreate, TaskUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[Task]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.id == id)
            .options(
                selectinload(Task.assignees),
                selectinload(Task.subtasks.and_(True)).selectinload(Subtask.assignees) # This doesn't actually sort
            )
        )
        # Wait, I'll just sort them in Python or use a better loader
        obj = result.scalars().first()
        if obj and obj.subtasks:
            obj.subtasks.sort(key=lambda x: (x.sort_index or 0, x.created_at))
        return obj

    async def get_multi_by_project(
        self, db: AsyncSession, *, project_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Task]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.project_id == project_id)
            .order_by(self.model.sort_index.asc(), self.model.created_at.asc())
            .options(
                selectinload(Task.assignees),
                selectinload(Task.subtasks).selectinload(Subtask.assignees)
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

    async def is_blocked_by_recursive(self, db: AsyncSession, item_id: UUID, blocker_candidate_id: UUID, visited: set) -> bool:
        if item_id == blocker_candidate_id:
            return True
        if item_id in visited:
            return False
        visited.add(item_id)
        
        # Check both Task and Subtask tables for blocked_by_ids
        for model in [Task, Subtask]:
            res = await db.execute(select(model.blocked_by_ids).filter(model.id == item_id))
            row = res.first()
            if row and row[0]:
                for b_id in row[0]:
                    if await self.is_blocked_by_recursive(db, b_id, blocker_candidate_id, visited):
                        return True
        return False

    async def check_for_active_blockers(self, db: AsyncSession, item_id: UUID, blocked_by_ids: List[UUID]) -> List[str]:
        active_blocker_titles = []
        if not blocked_by_ids:
            return []
            
        for b_id in blocked_by_ids:
            found = False
            for model in [Task, Subtask]:
                res = await db.execute(select(model).filter(model.id == b_id))
                obj = res.scalars().first()
                if obj:
                    found = True
                    if obj.status != Status.DONE:
                        active_blocker_titles.append(obj.title)
                    break
        return active_blocker_titles

    async def create(self, db: AsyncSession, *, obj_in: TaskCreate) -> Task:
        obj_data = clean_dict_datetimes(obj_in.dict(exclude_unset=True))
        assignee_ids = obj_data.pop("assignee_ids", [])
        subtasks_data = obj_data.pop("subtasks", [])
        
        # Calculate next sort_index if not provided
        if "sort_index" not in obj_data:
            result = await db.execute(
                select(self.model.sort_index)
                .filter(self.model.project_id == obj_data["project_id"])
                .order_by(self.model.sort_index.desc())
                .limit(1)
            )
            max_idx = result.scalar()
            obj_data["sort_index"] = (max_idx or 0) + 10
            
        db_obj = self.model(**obj_data)
        
        if assignee_ids:
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(assignee_ids)))
            users = res.scalars().all()
            db_obj.assignees = users

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        if subtasks_data:
            from app.schemas.task import SubtaskCreate
            for st_data in subtasks_data:
                if "owner_id" not in st_data:
                    st_data["owner_id"] = db_obj.owner_id
                st_in = SubtaskCreate(
                    task_id=db_obj.id,
                    **st_data
                )
                await subtask.create(db, obj_in=st_in)
        
        await self.update_project_progress(db, db_obj.project_id)
        if assignee_ids:
            await self.notify_assignees(db, db_obj.id, assignee_ids, db_obj.title)
            
        return db_obj

    async def notify_assignees(self, db: AsyncSession, item_id: UUID, user_ids: List[UUID], item_title: str, is_subtask: bool = False):
        from app.crud.crud_notification import notification as notification_crud
        from app.schemas.notification import NotificationCreate
        
        link = f"/tasks/{item_id}" if not is_subtask else f"/subtasks/{item_id}"
        item_type = "Task" if not is_subtask else "Subtask"
        
        for user_id in user_ids:
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
        if isinstance(obj_in, TaskUpdate):
            obj_data = clean_dict_datetimes(obj_in.dict(exclude_unset=True))
        else:
            obj_data = clean_dict_datetimes(obj_in)
        
        if obj_data.get("status") == Status.DONE:
            active_blockers = await self.check_for_active_blockers(db, db_obj.id, db_obj.blocked_by_ids or [])
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
            .order_by(self.model.sort_index.asc(), self.model.created_at.asc())
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
        obj_data = clean_dict_datetimes(obj_in.dict(exclude_unset=True))
        assignee_ids = obj_data.pop("assignee_ids", [])
        
        # Calculate next sort_index if not provided
        if "sort_index" not in obj_data:
            result = await db.execute(
                select(self.model.sort_index)
                .filter(self.model.task_id == obj_data["task_id"])
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
        
        await self.update_parent_task_status(db, db_obj.task_id)
        if assignee_ids:
            await task.notify_assignees(db, db_obj.id, assignee_ids, db_obj.title, is_subtask=True)
            
        return db_obj

    async def update(
        self, db: AsyncSession, *, db_obj: Subtask, obj_in: Union[SubtaskUpdate, Dict[str, Any]]
    ) -> Subtask:
        if isinstance(obj_in, SubtaskUpdate):
            obj_data = clean_dict_datetimes(obj_in.dict(exclude_unset=True))
        else:
            obj_data = clean_dict_datetimes(obj_in)
        
        if obj_data.get("status") == Status.DONE:
            active_blockers = await task.check_for_active_blockers(db, db_obj.id, db_obj.blocked_by_ids or [])
            if active_blockers:
                raise ValueError(f"Subtask is blocked by unfinished items: {', '.join(active_blockers)}")
            if db_obj.status != Status.DONE:
                obj_data["completed_at"] = datetime.utcnow()
        elif "status" in obj_data and obj_data["status"] != Status.DONE:
            obj_data["completed_at"] = None

        if "blocked_by_ids" in obj_data:
            new_ids = obj_data["blocked_by_ids"]
            for b_id in new_ids:
                if b_id == db_obj.id:
                    raise ValueError("Item cannot block itself")
                if await task.is_blocked_by_recursive(db, b_id, db_obj.id, set()):
                    raise ValueError(f"Circular dependency detected with item ID: {b_id}")

        if "assignee_ids" in obj_data:
            new_ids = obj_data.pop("assignee_ids")
            current_ids = [u.id for u in db_obj.assignees]
            added_ids = [uid for uid in new_ids if uid not in current_ids]
            
            from app.models.user import User
            res = await db.execute(select(User).filter(User.id.in_(new_ids)))
            db_obj.assignees = res.scalars().all()
            
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
