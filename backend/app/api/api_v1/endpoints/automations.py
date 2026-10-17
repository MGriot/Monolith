"""Automation rules of a project. Mounted under /projects: /projects/{id}/automations.

Reading (rules and run history): any project role. Creating/changing/deleting: project admin (owner, admin members,
superusers) - a rule can assign people, notify them and call webhooks, so it is part of the project settings.
"""
from typing import Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.access import ADMIN, project_role, require_project_access
from app.core.automations import MAX_RULES_PER_PROJECT, referenced_user_ids, referenced_webhook_ids, validate_rule
from app.models.automation import AutomationRule as RuleModel, AutomationRun as RunModel
from app.models.user import User
from app.models.webhook import Webhook
from app.schemas.automation import AutomationRule, AutomationRuleCreate, AutomationRuleUpdate, AutomationRun

router = APIRouter()


class _Person:
    """Just enough of a User for access.project_role (id + is_superuser) when checking someone else's membership."""

    def __init__(self, user_id: UUID):
        self.id = user_id
        self.is_superuser = False


async def _get_rule(db: AsyncSession, project_id: UUID, rule_id: UUID) -> RuleModel:
    rule = (await db.execute(select(RuleModel).where(RuleModel.id == rule_id, RuleModel.project_id == project_id))).scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


async def _check_references(db: AsyncSession, project_id: UUID, actions: list) -> None:
    """People an action assigns/notifies must belong to the project; webhooks must be the project's own."""
    for uid in set(referenced_user_ids(actions)):
        if await project_role(db, project_id, _Person(UUID(uid))) is None:
            raise HTTPException(status_code=400, detail="An action refers to a user who is not a member of this project")
    for wid in set(referenced_webhook_ids(actions)):
        hook = (await db.execute(select(Webhook.id).where(Webhook.id == UUID(wid), Webhook.project_id == project_id))).first()
        if not hook:
            raise HTTPException(status_code=400, detail="An action refers to a webhook that is not part of this project")


def _validated(trigger: str, conditions: list, actions: list):
    try:
        return validate_rule(trigger, conditions, actions)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}/automations", response_model=List[AutomationRule])
async def list_rules(
    project_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    await require_project_access(db, project_id, current_user)
    res = await db.execute(select(RuleModel).where(RuleModel.project_id == project_id).order_by(RuleModel.created_at))
    return res.scalars().all()


@router.post("/{project_id}/automations", response_model=AutomationRule)
async def create_rule(
    project_id: UUID,
    body: AutomationRuleCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
    conditions, actions = _validated(body.trigger, body.conditions, body.actions)
    await _check_references(db, project_id, actions)
    count = (await db.execute(select(func.count()).select_from(RuleModel).where(RuleModel.project_id == project_id))).scalar_one()
    if count >= MAX_RULES_PER_PROJECT:
        raise HTTPException(status_code=400, detail=f"At most {MAX_RULES_PER_PROJECT} rules per project")
    rule = RuleModel(
        project_id=project_id, name=body.name.strip(), enabled=body.enabled, trigger=body.trigger,
        conditions=conditions, actions=actions, created_by=current_user.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.put("/{project_id}/automations/{rule_id}", response_model=AutomationRule)
async def update_rule(
    project_id: UUID,
    rule_id: UUID,
    body: AutomationRuleUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
    rule = await _get_rule(db, project_id, rule_id)
    data = body.model_dump(exclude_unset=True)
    trigger = data.get("trigger", rule.trigger)
    conditions, actions = _validated(
        trigger,
        data["conditions"] if data.get("conditions") is not None else rule.conditions,
        data["actions"] if data.get("actions") is not None else rule.actions,
    )
    if data.get("actions") is not None:
        await _check_references(db, project_id, actions)
    rule.trigger, rule.conditions, rule.actions = trigger, conditions, actions
    if data.get("name") is not None:
        rule.name = data["name"].strip()
    if data.get("enabled") is not None:
        rule.enabled = data["enabled"]
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{project_id}/automations/{rule_id}", status_code=204)
async def delete_rule(
    project_id: UUID,
    rule_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
    rule = await _get_rule(db, project_id, rule_id)
    await db.delete(rule)
    await db.commit()


@router.get("/{project_id}/automations/{rule_id}/runs", response_model=List[AutomationRun])
async def list_rule_runs(
    project_id: UUID,
    rule_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    await require_project_access(db, project_id, current_user)
    await _get_rule(db, project_id, rule_id)
    res = await db.execute(select(RunModel).where(RunModel.rule_id == rule_id).order_by(RunModel.ran_at.desc()).limit(limit))
    return res.scalars().all()

