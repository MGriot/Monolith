"""Operator view of the e-mail queue (superusers only)."""
from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.models.email_outbox import EmailOutbox
from app.models.user import User

router = APIRouter()


class OutboxItem(BaseModel):
    id: UUID
    kind: str
    to_email: str
    subject: str
    status: str
    attempts: int
    next_attempt_at: datetime
    last_error: Optional[str] = None
    created_at: datetime
    sent_at: Optional[datetime] = None
    body_text: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("/", response_model=List[OutboxItem])
async def list_outbox(
    status: Optional[str] = Query(None, pattern="^(pending|sent|failed)$"),
    kind: Optional[str] = None,
    to_email: Optional[str] = None,
    include_body: bool = False,
    skip: int = 0,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(deps.get_db),
    _admin: User = Depends(deps.get_current_admin),
) -> Any:
    """Queued/sent/failed messages, newest first. Bodies (which can contain reset links) only on request."""
    stmt = select(EmailOutbox).order_by(EmailOutbox.created_at.desc()).offset(skip).limit(limit)
    if status:
        stmt = stmt.where(EmailOutbox.status == status)
    if kind:
        stmt = stmt.where(EmailOutbox.kind == kind)
    if to_email:
        stmt = stmt.where(func.lower(EmailOutbox.to_email) == to_email.lower())
    rows = (await db.execute(stmt)).scalars().all()
    return [
        OutboxItem.model_validate(r).model_copy(update={} if include_body else {"body_text": None}) for r in rows
    ]


@router.post("/{item_id}/retry", response_model=OutboxItem)
async def retry_outbox_item(
    item_id: UUID, db: AsyncSession = Depends(deps.get_db), _admin: User = Depends(deps.get_current_admin)
) -> Any:
    """Put a failed message back in the queue."""
    row = await db.get(EmailOutbox, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    if row.status == "sent":
        raise HTTPException(status_code=400, detail="Message was already sent")
    row.status, row.attempts, row.next_attempt_at = "pending", 0, datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return OutboxItem.model_validate(row).model_copy(update={"body_text": None})
