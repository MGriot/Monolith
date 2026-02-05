from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import deps
from app.crud import crud_metadata
from app.schemas import metadata as schemas
from app.models.user import User

router = APIRouter()

# --- Topics ---

@router.get("/topics", response_model=List[schemas.Topic])
async def read_topics(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    return await crud_metadata.topic.get_multi(db, skip=skip, limit=limit)

@router.post("/topics", response_model=schemas.Topic)
async def create_topic(
    *,
    db: AsyncSession = Depends(deps.get_db),
    topic_in: schemas.TopicCreate,
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    return await crud_metadata.topic.create(db, obj_in=topic_in)

@router.put("/topics/{id}", response_model=schemas.Topic)
async def update_topic(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: str,
    topic_in: schemas.TopicUpdate,
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    topic = await crud_metadata.topic.get(db, id=id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return await crud_metadata.topic.update(db, db_obj=topic, obj_in=topic_in)

@router.delete("/topics/{id}", response_model=schemas.Topic)
async def delete_topic(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: str,
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    topic = await crud_metadata.topic.get(db, id=id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return await crud_metadata.topic.remove(db, id=id)

# --- Work Types ---

@router.get("/work-types", response_model=List[schemas.WorkType])
async def read_work_types(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    return await crud_metadata.work_type.get_multi(db, skip=skip, limit=limit)

@router.post("/work-types", response_model=schemas.WorkType)
async def create_work_type(
    *,
    db: AsyncSession = Depends(deps.get_db),
    work_type_in: schemas.WorkTypeCreate,
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    return await crud_metadata.work_type.create(db, obj_in=work_type_in)

@router.put("/work-types/{id}", response_model=schemas.WorkType)
async def update_work_type(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: str,
    work_type_in: schemas.WorkTypeUpdate,
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    work_type = await crud_metadata.work_type.get(db, id=id)
    if not work_type:
        raise HTTPException(status_code=404, detail="Work Type not found")
    return await crud_metadata.work_type.update(db, db_obj=work_type, obj_in=work_type_in)

@router.delete("/work-types/{id}", response_model=schemas.WorkType)
async def delete_work_type(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: str,
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    work_type = await crud_metadata.work_type.get(db, id=id)
    if not work_type:
        raise HTTPException(status_code=404, detail="Work Type not found")
    return await crud_metadata.work_type.remove(db, id=id)
