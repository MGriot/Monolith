from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import InvalidTokenError
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.token import TokenPayload
from app.crud import crud_user
from app.core.activity import set_actor

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"/api/v1/login/access-token"
)

reusable_oauth2_optional = OAuth2PasswordBearer(
    tokenUrl=f"/api/v1/login/access-token",
    auto_error=False
)

def _credentials_exc() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(reusable_oauth2)
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise _credentials_exc()
    if token_data.sub is None or payload.get("purpose"):
        raise _credentials_exc()  # purpose tokens (password reset, verification) are not login tokens
    user = await crud_user.get(db, id=token_data.sub)
    # Unknown or deactivated accounts must not keep working with a still-valid token.
    if not user or not user.is_active:
        raise _credentials_exc()
    set_actor(db, user.id)  # the change log attributes this request's edits to them
    return user

async def get_current_user_optional(
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(reusable_oauth2_optional)
) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        return None
    
    if payload.get("purpose"):
        return None
    user = await crud_user.get(db, id=token_data.sub) if token_data.sub else None
    return user if user and user.is_active else None

async def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user
