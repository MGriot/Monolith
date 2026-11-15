from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import String, bindparam, func, or_, select, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.custom_fields import user_ids_in, validate_custom_values
from app.models.custom_field import CustomFieldDef
from app.models.user import User

# applies_to -> table holding the values (fixed strings, never user input)
VALUE_TABLES = {"project": ("projects", "id"), "task": ("tasks", "project_id")}


async def list_defs(db: AsyncSession, project_id: Optional[UUID], applies_to: Optional[str] = None) -> List[CustomFieldDef]:
    """Global definitions first, then the project's own (if a project is given), each by position."""
    scope = CustomFieldDef.project_id.is_(None)
    if project_id is not None:
        scope = or_(scope, CustomFieldDef.project_id == project_id)
    stmt = select(CustomFieldDef).where(scope)
    if applies_to:
        stmt = stmt.where(CustomFieldDef.applies_to == applies_to)
    stmt = stmt.order_by(CustomFieldDef.project_id.isnot(None), CustomFieldDef.position, CustomFieldDef.created_at)
    return list((await db.execute(stmt)).scalars().all())


async def list_global_defs(db: AsyncSession, applies_to: Optional[str] = None) -> List[CustomFieldDef]:
    stmt = select(CustomFieldDef).where(CustomFieldDef.project_id.is_(None))
    if applies_to:
        stmt = stmt.where(CustomFieldDef.applies_to == applies_to)
    return list((await db.execute(stmt.order_by(CustomFieldDef.position, CustomFieldDef.created_at))).scalars().all())


async def name_taken(db: AsyncSession, project_id: Optional[UUID], applies_to: str, name: str,
                     exclude_id: Optional[UUID] = None) -> bool:
    """A name must be unique among what one project sees: its own fields plus the global ones (case-insensitive).

    For a global definition that means across every project, since all of them see it.
    """
    stmt = select(CustomFieldDef.id).where(
        CustomFieldDef.applies_to == applies_to, func.lower(CustomFieldDef.name) == name.strip().lower()
    )
    if project_id is not None:
        stmt = stmt.where(or_(CustomFieldDef.project_id.is_(None), CustomFieldDef.project_id == project_id))
    if exclude_id is not None:
        stmt = stmt.where(CustomFieldDef.id != exclude_id)
    return (await db.execute(stmt.limit(1))).first() is not None


async def validate_for_project(
    db: AsyncSession, project_id: Optional[UUID], values: Dict[str, Any], applies_to: str = "task"
) -> Dict[str, Any]:
    """Validate custom values against the definitions a project sees. Raises ValueError (map to HTTP 400).

    A task outside any project only sees the global task fields.
    """
    defs = await list_defs(db, project_id, applies_to)
    cleaned = validate_custom_values(defs, values)
    wanted = user_ids_in(defs, cleaned)
    if wanted:
        found = set((await db.execute(select(User.id).where(User.id.in_(wanted)))).scalars().all())
        if wanted - found:
            raise ValueError("A user field references an unknown user")
    return cleaned


def _scope_sql(fdef: CustomFieldDef) -> tuple[str, str, Dict[str, Any]]:
    table, project_col = VALUE_TABLES[fdef.applies_to]
    params: Dict[str, Any] = {"k": str(fdef.id)}
    where = "jsonb_exists(custom_values, :k)"
    if fdef.project_id is not None:
        where += f" AND {project_col} = :p"
        params["p"] = fdef.project_id
    return table, where, params


async def strip_field(db: AsyncSession, fdef: CustomFieldDef) -> None:
    """Remove a deleted definition's key from every row that holds it (the caller commits)."""
    table, where, params = _scope_sql(fdef)
    await db.execute(text(f"UPDATE {table} SET custom_values = custom_values - CAST(:k AS text) WHERE {where}"), params)


async def drop_values_outside_options(db: AsyncSession, fdef: CustomFieldDef, options: List[str]) -> None:
    """After a select field's options shrink, clear values that are no longer one of them (the caller commits)."""
    table, where, params = _scope_sql(fdef)
    stmt = text(
        f"UPDATE {table} SET custom_values = custom_values - CAST(:k AS text) "
        f"WHERE {where} AND NOT ((custom_values ->> :k) = ANY(:opts))"
    ).bindparams(bindparam("opts", type_=ARRAY(String)))
    await db.execute(stmt, {**params, "opts": options})


async def drop_values_outside_range(db: AsyncSession, fdef: CustomFieldDef) -> None:
    """After a number field's limits tighten, clear values now outside them (the caller commits)."""
    if fdef.min_value is None and fdef.max_value is None:
        return
    table, where, params = _scope_sql(fdef)
    bounds = []
    if fdef.min_value is not None:
        bounds.append("CAST(custom_values ->> :k AS double precision) < :lo")
        params["lo"] = fdef.min_value
    if fdef.max_value is not None:
        bounds.append("CAST(custom_values ->> :k AS double precision) > :hi")
        params["hi"] = fdef.max_value
    await db.execute(
        text(f"UPDATE {table} SET custom_values = custom_values - CAST(:k AS text) WHERE {where} "
             f"AND jsonb_typeof(custom_values -> :k) = 'number' AND ({' OR '.join(bounds)})"),
        params,
    )
