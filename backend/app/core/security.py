from datetime import datetime, timedelta, timezone
from typing import Any, Union
import jwt
import bcrypt
from app.core.config import settings

def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode('utf-8'), 
        hashed_password.encode('utf-8')
    )

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode('utf-8'), 
        bcrypt.gensalt()
    ).decode('utf-8')


def validate_password_strength(password: str) -> None:
    """Raise ValueError with a user-facing message if the password is unacceptable."""
    if len(password) < settings.MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {settings.MIN_PASSWORD_LENGTH} characters long")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes (bcrypt limit)")
    if password.strip() != password or not password.strip():
        raise ValueError("Password must not start or end with whitespace")


# --- single-purpose tokens (password reset, e-mail verification) ---------------------------------------------
# They are JWTs signed with the same key but carry a `purpose` claim; get_current_user refuses any token that has
# one, so a reset link can never be used as a login bearer token.

def password_fingerprint(hashed_password: str) -> str:
    """Changes whenever the password changes, which makes a reset token single-use."""
    import hashlib

    return hashlib.sha256(hashed_password.encode("utf-8")).hexdigest()[:16]


def create_purpose_token(subject: Union[str, Any], purpose: str, expires_delta: timedelta, **claims: Any) -> str:
    to_encode = {"sub": str(subject), "purpose": purpose, "exp": datetime.now(timezone.utc) + expires_delta, **claims}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_purpose_token(token: str, purpose: str) -> dict:
    """Return the claims, or raise ValueError for a bad/expired token or one issued for another purpose."""
    from jwt import InvalidTokenError

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except InvalidTokenError:
        raise ValueError("invalid or expired token")
    if payload.get("purpose") != purpose or not payload.get("sub"):
        raise ValueError("invalid or expired token")
    return payload
