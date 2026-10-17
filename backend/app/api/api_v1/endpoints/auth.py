"""Password reset and e-mail verification.

Both flows e-mail a single-purpose signed token. Responses never reveal whether an address has an account, requests
are throttled per client and per address, and a reset token stops working as soon as the password changes.
"""
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core import security
from app.core.config import settings
from app.core.mailer import absolute_url, enqueue_email
from app.core.ratelimit import FailureLimiter
from app.crud import crud_user
from app.models.user import User

router = APIRouter()

RESET_PURPOSE = "password-reset"
VERIFY_PURPOSE = "email-verify"
GENERIC_RESET_REPLY = {"detail": "If an account exists for this address, a reset link has been sent."}

# Every request counts (not only failures): 5 reset requests per hour per client address and per mailbox,
# 3 verification mails per hour per user.
forgot_ip_limiter = FailureLimiter(10, 3600)
forgot_email_limiter = FailureLimiter(5, 3600)
verify_limiter = FailureLimiter(3, 3600)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _throttle(limiter: FailureLimiter, key: str) -> None:
    wait = limiter.retry_after(key)
    if wait:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.", headers={"Retry-After": str(wait)})
    limiter.record_failure(key)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


class TokenIn(BaseModel):
    token: str


@router.get("/config")
async def public_config() -> Any:
    """What the signed-out pages need to know (hide the Register / Forgot-password links when they cannot work)."""
    return {
        "allow_signup": settings.ALLOW_SIGNUP,
        "email_enabled": settings.EMAIL_ENABLED,
        "min_password_length": settings.MIN_PASSWORD_LENGTH,
    }


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordIn, request: Request, db: AsyncSession = Depends(deps.get_db)
) -> Any:
    _throttle(forgot_ip_limiter, _client_ip(request))
    _throttle(forgot_email_limiter, body.email.lower())

    user = await crud_user.get_by_email(db, email=body.email)
    if user and user.is_active:
        token = security.create_purpose_token(
            user.id,
            RESET_PURPOSE,
            timedelta(minutes=settings.PASSWORD_RESET_MINUTES),
            fp=security.password_fingerprint(user.hashed_password),
        )
        await enqueue_email(
            db,
            to=user.email,
            kind="password_reset",
            template="password_reset",
            name=user.full_name or user.email,
            link=absolute_url(f"/reset-password?token={token}"),
            minutes=settings.PASSWORD_RESET_MINUTES,
        )
        await db.commit()
    # identical answer for unknown, inactive and valid addresses
    return GENERIC_RESET_REPLY


@router.post("/reset-password")
async def reset_password(body: ResetPasswordIn, request: Request, db: AsyncSession = Depends(deps.get_db)) -> Any:
    _throttle(forgot_ip_limiter, _client_ip(request))
    invalid = HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    try:
        claims = security.decode_purpose_token(body.token, RESET_PURPOSE)
        user = await crud_user.get(db, id=claims["sub"])
    except (ValueError, TypeError):
        raise invalid
    # The fingerprint of the current hash must match: after a successful reset (or any password change) the
    # link is dead, so a leaked mailbox archive cannot be replayed.
    if not user or not user.is_active or claims.get("fp") != security.password_fingerprint(user.hashed_password):
        raise invalid
    try:
        security.validate_password_strength(body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    user = await crud_user.update(db, db_obj=user, obj_in={"password": body.new_password})
    if user.email_verified_at is None:  # receiving the link proves control of the mailbox
        user.email_verified_at = datetime.utcnow()
        db.add(user)
        await db.commit()
    return {"detail": "Password updated. You can sign in now."}


@router.post("/request-email-verification")
async def request_email_verification(
    db: AsyncSession = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)
) -> Any:
    if current_user.email_verified_at is not None:
        return {"detail": "Your e-mail address is already verified."}
    _throttle(verify_limiter, str(current_user.id))
    token = security.create_purpose_token(
        current_user.id, VERIFY_PURPOSE, timedelta(hours=settings.EMAIL_VERIFY_HOURS), email=current_user.email
    )
    await enqueue_email(
        db,
        to=current_user.email,
        kind="email_verification",
        template="email_verification",
        name=current_user.full_name or current_user.email,
        link=absolute_url(f"/verify-email?token={token}"),
        hours=settings.EMAIL_VERIFY_HOURS,
    )
    await db.commit()
    return {"detail": "Verification e-mail sent."}


@router.post("/verify-email")
async def verify_email(body: TokenIn, request: Request, db: AsyncSession = Depends(deps.get_db)) -> Any:
    _throttle(forgot_ip_limiter, _client_ip(request))
    invalid = HTTPException(status_code=400, detail="This verification link is invalid or has expired.")
    try:
        claims = security.decode_purpose_token(body.token, VERIFY_PURPOSE)
        user = await crud_user.get(db, id=claims["sub"])
    except (ValueError, TypeError):
        raise invalid
    # the link was issued for one address: a changed address needs a new link
    if not user or not user.is_active or claims.get("email") != user.email:
        raise invalid
    if user.email_verified_at is None:
        user.email_verified_at = datetime.utcnow()
        db.add(user)
        await db.commit()
    return {"detail": "E-mail address verified."}
