from typing import Any, Dict, Generic, List, Optional, Type, TypeVar, Union
from uuid import UUID
from pydantic import BaseModel
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import Base
from app.core.utils import clean_dict_datetimes
from app.db.transaction import atomic, commit

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    async def get(self, db: AsyncSession, id: Any) -> Optional[ModelType]:
        result = await db.execute(select(self.model).filter(self.model.id == id))
        return result.scalars().first()

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100
    ) -> List[ModelType]:
        result = await db.execute(select(self.model).offset(skip).limit(limit))
        return result.scalars().all()

    async def create(self, db: AsyncSession, *, obj_in: CreateSchemaType) -> ModelType:
        obj_in_data = clean_dict_datetimes(obj_in.dict())
        db_obj = self.model(**obj_in_data)
        db.add(db_obj)
        await commit(db)
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: ModelType,
        obj_in: Union[UpdateSchemaType, Dict[str, Any]]
    ) -> ModelType:
        obj_data = obj_in.dict(exclude_unset=True) if isinstance(obj_in, BaseModel) else obj_in
        obj_data = clean_dict_datetimes(obj_data)
        mapper = sa_inspect(type(db_obj))
        columns = {c.key: c for c in mapper.columns}
        for field, value in obj_data.items():
            if not hasattr(db_obj, field):
                continue
            # Read-only @property (e.g. computed fields echoed back by clients) must not be assigned.
            prop = getattr(type(db_obj), field, None)
            if isinstance(prop, property) and prop.fset is None:
                continue
            # Ignore explicit nulls for NOT NULL columns instead of failing with a 500 at commit.
            col = columns.get(field)
            if value is None and col is not None and not col.nullable and not col.primary_key:
                continue
            setattr(db_obj, field, value)
        db.add(db_obj)
        await commit(db)
        await db.refresh(db_obj)
        return db_obj

    async def remove(self, db: AsyncSession, *, id: UUID) -> ModelType:
        obj = await self.get(db, id)
        if obj:
            await db.delete(obj)
            await commit(db)
        return obj
