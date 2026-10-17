from typing import Any, List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core import security
from app.core.config import settings
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
    is_admin = bool(current_user and current_user.is_superuser)
    if not is_admin:
        # Public sign-up is off by default; admins create accounts otherwise.
        if not settings.ALLOW_SIGNUP:
            raise HTTPException(status_code=403, detail="Registration is disabled. Ask an administrator for an account.")
        if user_in.is_superuser:
            raise HTTPException(status_code=403, detail="The user doesn't have enough privileges")
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
    return users

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
