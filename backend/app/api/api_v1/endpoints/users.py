import secrets
from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Body, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core import security
from app.core.config import settings
from app.core.mailer import absolute_url, enqueue_email
from app.crud import crud_user
from app.schemas.user import User, UserCreate, UserMe, UserUpdate
from app.models.user import User as UserModel

router = APIRouter()

@router.post("/", response_model=User)
async def create_user(
    *,
    db: AsyncSession = Depends(deps.get_db),
    user_in: UserCreate,
    current_user: UserModel = Depends(deps.get_current_user_optional),
) -> Any:
    """
    Create new user.
    """
    if not (current_user and current_user.is_superuser):
        # Only administrators create accounts directly. Everyone else asks via POST /auth/register-request,
        # and an administrator approves the request (which is what makes the account usable).
        raise HTTPException(
            status_code=403,
            detail="Accounts are created by an administrator. Use the registration request instead.",
        )
    try:
        security.validate_password_strength(user_in.password)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    user = await crud_user.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )
    user = await crud_user.create(db, obj_in=user_in)
    return user

@router.get("/", response_model=List[User])
async def read_users(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve users.
    """
    users = await crud_user.get_multi(db, skip=skip, limit=limit)
    # sign-up requests are not teammates until approved; admins review them via /users/pending
    return [u for u in users if u.approval_status == "approved"]


@router.get("/pending", response_model=List[User])
async def read_pending_users(
    db: AsyncSession = Depends(deps.get_db),
    _admin: UserModel = Depends(deps.get_current_admin),
) -> Any:
    """Sign-up requests waiting for a decision."""
    result = await db.execute(
        select(UserModel).where(UserModel.approval_status == "pending").order_by(UserModel.id).limit(200)
    )
    return result.scalars().all()


def _temp_password() -> str:
    # no look-alike characters (0/O, 1/l/I) so it can be typed from an e-mail; always passes the password policy
    alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(max(14, settings.MIN_PASSWORD_LENGTH)))


@router.post("/{user_id}/approve", response_model=User)
async def approve_user(
    user_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    _admin: UserModel = Depends(deps.get_current_admin),
) -> Any:
    """Activate a sign-up request and e-mail the person a temporary password they must change at first login."""
    user = await crud_user.get(db, id=user_id)
    if not user or user.approval_status != "pending":
        raise HTTPException(status_code=404, detail="No pending request for this user")
    if not settings.EMAIL_ENABLED:
        raise HTTPException(status_code=409, detail="E-mail is disabled, so the temporary password cannot be delivered")
    temp = _temp_password()
    user.hashed_password = security.get_password_hash(temp)
    user.is_active = True
    user.approval_status = "approved"
    user.must_change_password = True
    db.add(user)
    await enqueue_email(
        db,
        to=user.email,
        kind="account_approved",
        template="account_approved",
        name=user.full_name or user.email,
        temp_password=temp,
        link=absolute_url("/login"),
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/{user_id}/reject", status_code=204)
async def reject_user(
    user_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    _admin: UserModel = Depends(deps.get_current_admin),
) -> None:
    """Delete a sign-up request (the person may ask again)."""
    user = await crud_user.get(db, id=user_id)
    if not user or user.approval_status != "pending":
        raise HTTPException(status_code=404, detail="No pending request for this user")
    await db.delete(user)
    await db.commit()

@router.get("/me", response_model=UserMe)
async def read_user_me(
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """
    Get current user.
    """
    return current_user

class CalendarFeedOut(BaseModel):
    enabled: bool
    url: Optional[str] = None


def _feed_url(token: str) -> str:
    return f"{settings.APP_BASE_URL.rstrip('/')}/api/v1/calendar/feed/{token}.ics"


@router.get("/me/calendar-feed", response_model=CalendarFeedOut)
async def read_my_calendar_feed(current_user: UserModel = Depends(deps.get_current_user)) -> Any:
    token = current_user.calendar_token
    return CalendarFeedOut(enabled=bool(token), url=_feed_url(token) if token else None)


@router.post("/me/calendar-feed", response_model=CalendarFeedOut)
async def create_my_calendar_feed(
    db: AsyncSession = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """Create the personal calendar link, or replace it with a new one (the old link stops working at once)."""
    import secrets

    current_user.calendar_token = secrets.token_urlsafe(32)
    db.add(current_user)
    await db.commit()
    return CalendarFeedOut(enabled=True, url=_feed_url(current_user.calendar_token))


@router.delete("/me/calendar-feed", status_code=204)
async def revoke_my_calendar_feed(
    db: AsyncSession = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
) -> None:
    current_user.calendar_token = None
    db.add(current_user)
    await db.commit()


class McpTokenOut(BaseModel):
    id: UUID
    name: str
    token_prefix: str
    created_at: datetime
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class McpTokenCreated(McpTokenOut):
    token: str  # the secret: returned only by POST, never again


class McpTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=3650)


@router.get("/me/mcp-tokens", response_model=List[McpTokenOut])
async def list_my_mcp_tokens(
    db: AsyncSession = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """Personal MCP tokens (active and revoked), newest first. The secrets themselves are not stored."""
    from app.models.mcp_token import McpToken

    rows = await db.execute(
        select(McpToken).where(McpToken.user_id == current_user.id).order_by(McpToken.created_at.desc())
    )
    return rows.scalars().all()


@router.post("/me/mcp-tokens", response_model=McpTokenCreated, status_code=201)
async def create_my_mcp_token(
    body: McpTokenCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """Mint a token for MCP clients. It acts as you, with your project roles. Copy it now: it is shown only once."""
    from app.core.mcp_tokens import mint_token

    row, raw = await mint_token(db, current_user, body.name, body.expires_in_days)
    await db.commit()
    return McpTokenCreated(**McpTokenOut.model_validate(row).model_dump(), token=raw)


@router.delete("/me/mcp-tokens/{token_id}", status_code=204)
async def revoke_my_mcp_token(
    token_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: UserModel = Depends(deps.get_current_user),
) -> None:
    """Revoke a token; MCP calls made with it fail from the next request on."""
    from app.models.mcp_token import McpToken

    row = await db.get(McpToken, token_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Token not found")
    if row.revoked_at is None:
        row.revoked_at = datetime.utcnow()
        await db.commit()


@router.put("/me", response_model=UserMe)
async def update_user_me(
    *,
    db: AsyncSession = Depends(deps.get_db),
    password: str = Body(None),
    full_name: str = Body(None),
    email: EmailStr = Body(None),
    current_password: str = Body(None),
    notify_email_assignments: bool = Body(None),
    notify_email_digest: bool = Body(None),
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """
    Update own user. Changing the password or the e-mail requires the current password.
    """
    email_changed = email is not None and email != current_user.email
    if password is not None or email_changed:
        if not current_password or not security.verify_password(current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is required and must be correct")
    if password is not None:
        try:
            security.validate_password_strength(password)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
    if email_changed:
        if await crud_user.get_by_email(db, email=email):
            raise HTTPException(status_code=400, detail="This e-mail address is already in use")

    current_user_data = UserUpdate()
    if password is not None:
        current_user_data.password = password
        current_user_data.must_change_password = False
    if full_name is not None:
        current_user_data.full_name = full_name
    if email_changed:
        current_user_data.email = email
        current_user_data.email_verified_at = None  # the new address must be confirmed again
    if notify_email_assignments is not None:
        current_user_data.notify_email_assignments = notify_email_assignments
    if notify_email_digest is not None:
        current_user_data.notify_email_digest = notify_email_digest
    user = await crud_user.update(db, db_obj=current_user, obj_in=current_user_data)
    return user
