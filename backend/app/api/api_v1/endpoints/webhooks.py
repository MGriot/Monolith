from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud import crud_webhook
from app.schemas.webhook import Webhook, WebhookCreate, WebhookUpdate
from app.models.user import User
from app.core.webhooks import webhook_service

router = APIRouter()

@router.get("/", response_model=List[Webhook])
async def read_webhooks(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve webhooks owned by the current user.
    """
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
    if webhook.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
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
    if webhook.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
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
