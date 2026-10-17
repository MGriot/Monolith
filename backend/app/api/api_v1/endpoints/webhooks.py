from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.access import ADMIN, has_project_access, require_project_access
from app.crud import crud_webhook
from app.schemas.webhook import Webhook, WebhookCreate, WebhookUpdate
from app.models.user import User
from app.models.webhook import Webhook as WebhookModel
from app.core.webhooks import webhook_service
from app.core.netguard import UnsafeURLError, assert_safe_url

router = APIRouter()


async def _require_manage(db: AsyncSession, webhook, user: User) -> None:
    """The creator and superusers may manage a webhook; so may the admins of the project a project webhook belongs to."""
    if webhook.owner_id == user.id or user.is_superuser:
        return
    if webhook.project_id and await has_project_access(db, webhook.project_id, user, min_role=ADMIN):
        return
    raise HTTPException(status_code=403, detail="Not enough permissions")

@router.get("/", response_model=List[Webhook])
async def read_webhooks(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    project_id: Optional[UUID] = None,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve webhooks owned by the current user.
    """
    if project_id:
        await require_project_access(db, project_id, current_user, min_role=ADMIN)
        res = await db.execute(select(WebhookModel).where(WebhookModel.project_id == project_id).order_by(WebhookModel.name).offset(skip).limit(limit))
        return res.scalars().all()
    if current_user.is_superuser:
        return await crud_webhook.webhook.get_multi(db, skip=skip, limit=limit)
    return await crud_webhook.webhook.get_multi_by_owner(
        db, owner_id=current_user.id, skip=skip, limit=limit
    )

@router.post("/", response_model=Webhook)
async def create_webhook(
    *,
    db: AsyncSession = Depends(deps.get_db),
    obj_in: WebhookCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create a new webhook.
    """
    if obj_in.project_id:  # a project webhook receives that project's task events: only its admins may attach one
        await require_project_access(db, obj_in.project_id, current_user, min_role=ADMIN)
    try:
        await assert_safe_url(obj_in.url)
    except UnsafeURLError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await crud_webhook.webhook.create_with_owner(
        db, obj_in=obj_in, owner_id=current_user.id
    )

@router.put("/{id}", response_model=Webhook)
async def update_webhook(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    obj_in: WebhookUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a webhook.
    """
    webhook = await crud_webhook.webhook.get(db, id=id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await _require_manage(db, webhook, current_user)
    if obj_in.project_id and obj_in.project_id != webhook.project_id:
        await require_project_access(db, obj_in.project_id, current_user, min_role=ADMIN)
    if obj_in.url:
        try:
            await assert_safe_url(obj_in.url)
        except UnsafeURLError as e:
            raise HTTPException(status_code=400, detail=str(e))
    return await crud_webhook.webhook.update(db, db_obj=webhook, obj_in=obj_in)

@router.delete("/{id}", response_model=Webhook)
async def delete_webhook(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a webhook.
    """
    webhook = await crud_webhook.webhook.get(db, id=id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await _require_manage(db, webhook, current_user)
    return await crud_webhook.webhook.remove(db, id=id)

@router.post("/{id}/test")
async def test_webhook(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Send a test notification to the webhook.
    """
    webhook = await crud_webhook.webhook.get(db, id=id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await _require_manage(db, webhook, current_user)

    success = False
    if webhook.provider == "slack":
        success = await webhook_service.send_slack_notification(
            webhook.url, 
            f"🔔 *Monolith Test*: Your webhook '{webhook.name}' is correctly configured!"
        )
    elif webhook.provider == "discord":
        success = await webhook_service.send_discord_notification(
            webhook.url, 
            f"🔔 **Monolith Test**: Your webhook '{webhook.name}' is correctly configured!"
        )
    else:
        success = await webhook_service.send_generic_notification(
            webhook.url, 
            {"message": "Monolith Webhook Test Success", "webhook_name": webhook.name}
        )
    
    if not success:
        raise HTTPException(status_code=400, detail="Webhook delivery failed. Check the URL.")
    
    return {"status": "success", "message": "Test notification sent"}
