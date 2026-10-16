from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core import security
from app.core.config import settings
from app.core.ratelimit import FailureLimiter
from app.crud import crud_user
from app.schemas.token import Token

router = APIRouter()

login_limiter = FailureLimiter(settings.LOGIN_MAX_FAILURES, settings.LOGIN_WINDOW_SECONDS)
# One address spraying many different accounts never trips the per-account limiter above.
ip_limiter = FailureLimiter(settings.LOGIN_MAX_FAILURES * 6, settings.LOGIN_WINDOW_SECONDS)


def _client_ip(request: Request) -> str:
    # uvicorn --proxy-headers already resolves X-Forwarded-For from trusted proxies into request.client
    return request.client.host if request.client else "unknown"

@router.post("/login/access-token", response_model=Token)
async def login_access_token(
    request: Request,
    db: AsyncSession = Depends(deps.get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    # Throttle per (client address, account) and per address so one host cannot spray many accounts.
    ip = _client_ip(request)
    account_key = f"{ip}|{form_data.username.lower()}"
    wait = max(login_limiter.retry_after(account_key), ip_limiter.retry_after(ip))
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(wait)},
        )
    user = await crud_user.authenticate(
        db, email=form_data.username, password=form_data.password
    )
    if not user:
        login_limiter.record_failure(account_key)
        ip_limiter.record_failure(ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    login_limiter.reset(account_key)
    access_token = security.create_access_token(
        subject=user.id
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }
