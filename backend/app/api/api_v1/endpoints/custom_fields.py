"""Custom field definitions of a project. Mounted under /projects, so paths are /projects/{id}/custom-fields."""
from typing import Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.access import ADMIN, require_project_access
from app.core.custom_fields import normalize_options
from app.crud import crud_custom_field
from app.models.custom_field import CustomFieldDef as CustomFieldDefModel
from app.models.user import User
from app.schemas.custom_field import CustomFieldDef, CustomFieldDefCreate, CustomFieldDefUpdate

router = APIRouter()

DUPLICATE_NAME = "A field with this name already exists in the project"


async def _get_def(db: AsyncSession, project_id: UUID, field_id: UUID) -> CustomFieldDefModel:
    res = await db.execute(
        select(CustomFieldDefModel).where(CustomFieldDefModel.id == field_id, CustomFieldDefModel.project_id == project_id)
    )
    obj = res.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Custom field not found")
    return obj


@router.get("/{project_id}/custom-fields", response_model=List[CustomFieldDef])
async def list_custom_fields(
    project_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    await require_project_access(db, project_id, current_user)
    return await crud_custom_field.list_defs(db, project_id)


@router.post("/{project_id}/custom-fields", response_model=CustomFieldDef)
async def create_custom_field(
    project_id: UUID,
    body: CustomFieldDefCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
    try:
        options = normalize_options(body.field_type, body.options)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    position = body.position
    if position is None:
        position = (
            await db.execute(
                select(func.coalesce(func.max(CustomFieldDefModel.position), -1) + 1).where(
                    CustomFieldDefModel.project_id == project_id
                )
            )
        ).scalar_one()
    obj = CustomFieldDefModel(
        project_id=project_id, name=body.name.strip(), field_type=body.field_type, options=options, position=position
    )
    db.add(obj)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE_NAME)
    await db.refresh(obj)
    return obj


@router.put("/{project_id}/custom-fields/{field_id}", response_model=CustomFieldDef)
async def update_custom_field(
    project_id: UUID,
    field_id: UUID,
    body: CustomFieldDefUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
    obj = await _get_def(db, project_id, field_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("name") is not None:
        obj.name = data["name"].strip()
    if data.get("position") is not None:
        obj.position = data["position"]
    options_changed = False
    if data.get("options") is not None:
        if obj.field_type != "select":
            raise HTTPException(status_code=400, detail="Only select fields have options")
        try:
            obj.options = normalize_options("select", data["options"])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        options_changed = True
    if options_changed:
        await crud_custom_field.drop_values_outside_options(db, project_id, field_id, obj.options)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE_NAME)
    await db.refresh(obj)
    return obj


@router.delete("/{project_id}/custom-fields/{field_id}", status_code=204)
async def delete_custom_field(
    project_id: UUID,
    field_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    """Delete the definition and the values stored for it on the project's tasks."""
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
    obj = await _get_def(db, project_id, field_id)
    await crud_custom_field.strip_field_from_tasks(db, project_id, field_id)
    await db.delete(obj)
    await db.commit()
