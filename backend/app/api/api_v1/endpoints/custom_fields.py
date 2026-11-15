"""Custom field definitions.

`router` is mounted under /projects: /projects/{id}/custom-fields lists what the project sees (global + its own)
and edits the project's own fields (project admin). `global_router` is mounted at /custom-fields: global fields
every project gets, readable by any signed-in user and editable by superusers only.
"""
from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.access import ADMIN, require_project_access
from app.core.custom_fields import NUMERIC_TYPES, normalize_number_settings, normalize_options
from app.crud import crud_custom_field
from app.models.custom_field import CustomFieldDef as CustomFieldDefModel
from app.models.user import User
from app.schemas.custom_field import AppliesTo, CustomFieldDef, CustomFieldDefCreate, CustomFieldDefUpdate

router = APIRouter()
global_router = APIRouter()

DUPLICATE_NAME = "A field with this name already exists in the project"
DUPLICATE_GLOBAL_NAME = "A field with this name already exists (globally or in a project)"
NUMBER_KEYS = ("unit", "currency", "min_value", "max_value", "decimals")


async def _get_def(db: AsyncSession, project_id: Optional[UUID], field_id: UUID) -> CustomFieldDefModel:
    """The definition with this id in this scope (project_id None = global)."""
    scope = (CustomFieldDefModel.project_id.is_(None) if project_id is None
             else CustomFieldDefModel.project_id == project_id)
    obj = (await db.execute(select(CustomFieldDefModel).where(CustomFieldDefModel.id == field_id, scope))).scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Custom field not found")
    return obj


async def _create(db: AsyncSession, project_id: Optional[UUID], body: CustomFieldDefCreate) -> CustomFieldDefModel:
    duplicate = DUPLICATE_NAME if project_id else DUPLICATE_GLOBAL_NAME
    try:
        options = normalize_options(body.field_type, body.options)
        num = normalize_number_settings(
            body.field_type, body.unit, body.currency, body.min_value, body.max_value, body.decimals
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    name = body.name.strip()
    if await crud_custom_field.name_taken(db, project_id, body.applies_to, name):
        raise HTTPException(status_code=409, detail=duplicate)
    position = body.position
    if position is None:
        scope = (CustomFieldDefModel.project_id.is_(None) if project_id is None
                 else CustomFieldDefModel.project_id == project_id)
        position = (
            await db.execute(
                select(func.coalesce(func.max(CustomFieldDefModel.position), -1) + 1).where(
                    scope, CustomFieldDefModel.applies_to == body.applies_to
                )
            )
        ).scalar_one()
    obj = CustomFieldDefModel(
        project_id=project_id, applies_to=body.applies_to, name=name, field_type=body.field_type, options=options,
        unit=num.unit, currency=num.currency, min_value=num.min_value, max_value=num.max_value, decimals=num.decimals,
        position=position,
    )
    db.add(obj)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=duplicate)
    await db.refresh(obj)
    return obj


async def _update(db: AsyncSession, obj: CustomFieldDefModel, body: CustomFieldDefUpdate) -> CustomFieldDefModel:
    duplicate = DUPLICATE_NAME if obj.project_id else DUPLICATE_GLOBAL_NAME
    data = body.model_dump(exclude_unset=True)
    if data.get("name") is not None:
        name = data["name"].strip()
        if await crud_custom_field.name_taken(db, obj.project_id, obj.applies_to, name, exclude_id=obj.id):
            raise HTTPException(status_code=409, detail=duplicate)
        obj.name = name
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
    range_changed = False
    if any(k in data for k in NUMBER_KEYS):
        merged = {k: data.get(k, getattr(obj, k)) for k in NUMBER_KEYS}
        try:
            num = normalize_number_settings(obj.field_type, **merged)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        range_changed = (num.min_value, num.max_value) != (obj.min_value, obj.max_value)
        for k in NUMBER_KEYS:
            setattr(obj, k, getattr(num, k))
    if options_changed:
        await crud_custom_field.drop_values_outside_options(db, obj, obj.options)
    if range_changed and obj.field_type in NUMERIC_TYPES:
        await crud_custom_field.drop_values_outside_range(db, obj)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=duplicate)
    await db.refresh(obj)
    return obj


async def _delete(db: AsyncSession, obj: CustomFieldDefModel) -> None:
    await crud_custom_field.strip_field(db, obj)
    await db.delete(obj)
    await db.commit()


# --------------------------------------------------------------------------- per project


@router.get("/{project_id}/custom-fields", response_model=List[CustomFieldDef])
async def list_custom_fields(
    project_id: UUID,
    applies_to: Optional[AppliesTo] = Query(None, description="project or task; both when omitted"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Every field the project sees: global ones first (scope 'global', read-only here), then its own."""
    await require_project_access(db, project_id, current_user)
    return await crud_custom_field.list_defs(db, project_id, applies_to)


@router.post("/{project_id}/custom-fields", response_model=CustomFieldDef)
async def create_custom_field(
    project_id: UUID,
    body: CustomFieldDefCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
    return await _create(db, project_id, body)


@router.put("/{project_id}/custom-fields/{field_id}", response_model=CustomFieldDef)
async def update_custom_field(
    project_id: UUID,
    field_id: UUID,
    body: CustomFieldDefUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
    return await _update(db, await _get_def(db, project_id, field_id), body)


@router.delete("/{project_id}/custom-fields/{field_id}", status_code=204)
async def delete_custom_field(
    project_id: UUID,
    field_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    """Delete the definition and the values stored for it on the project (or its tasks)."""
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
    await _delete(db, await _get_def(db, project_id, field_id))


# --------------------------------------------------------------------------- global


@global_router.get("", response_model=List[CustomFieldDef])
async def list_global_custom_fields(
    applies_to: Optional[AppliesTo] = Query(None, description="project or task; both when omitted"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Global fields, which every project gets."""
    return await crud_custom_field.list_global_defs(db, applies_to)


@global_router.post("", response_model=CustomFieldDef)
async def create_global_custom_field(
    body: CustomFieldDefCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    return await _create(db, None, body)


@global_router.put("/{field_id}", response_model=CustomFieldDef)
async def update_global_custom_field(
    field_id: UUID,
    body: CustomFieldDefUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    return await _update(db, await _get_def(db, None, field_id), body)


@global_router.delete("/{field_id}", status_code=204)
async def delete_global_custom_field(
    field_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin),
) -> None:
    """Delete a global field and its values on every project (or task)."""
    await _delete(db, await _get_def(db, None, field_id))
