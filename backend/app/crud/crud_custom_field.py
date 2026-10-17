from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import String, bindparam, select, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.custom_fields import user_ids_in, validate_custom_values
from app.models.custom_field import CustomFieldDef
from app.models.user import User


async def list_defs(db: AsyncSession, project_id: UUID) -> List[CustomFieldDef]:
    res = await db.execute(
        select(CustomFieldDef)
        .where(CustomFieldDef.project_id == project_id)
        .order_by(CustomFieldDef.position, CustomFieldDef.created_at)
    )
    return list(res.scalars().all())


async def validate_for_project(db: AsyncSession, project_id: Optional[UUID], values: Dict[str, Any]) -> Dict[str, Any]:
    """Validate task custom values against the project's definitions. Raises ValueError (map to HTTP 400).

    A task outside any project has no definitions, so only an empty object is valid.
    """
    defs = await list_defs(db, project_id) if project_id else []
    cleaned = validate_custom_values(defs, values)
    wanted = user_ids_in(defs, cleaned)
    if wanted:
        found = set((await db.execute(select(User.id).where(User.id.in_(wanted)))).scalars().all())
        if wanted - found:
            raise ValueError("A user field references an unknown user")
    return cleaned


async def strip_field_from_tasks(db: AsyncSession, project_id: UUID, field_id: UUID) -> None:
    """Remove a deleted definition's key from every task of the project (the caller commits)."""
    await db.execute(
        text("UPDATE tasks SET custom_values = custom_values - CAST(:k AS text) WHERE project_id = :p AND jsonb_exists(custom_values, :k)"),
        {"k": str(field_id), "p": project_id},
    )


async def drop_values_outside_options(db: AsyncSession, project_id: UUID, field_id: UUID, options: List[str]) -> None:
    """After a select field's options shrink, clear values that are no longer one of them (the caller commits)."""
    stmt = text(
        "UPDATE tasks SET custom_values = custom_values - CAST(:k AS text) "
        "WHERE project_id = :p AND jsonb_exists(custom_values, :k) AND NOT ((custom_values ->> :k) = ANY(:opts))"
    ).bindparams(bindparam("opts", type_=ARRAY(String)))
    await db.execute(stmt, {"k": str(field_id), "p": project_id, "opts": options})
