from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr

class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True
    is_superuser: bool = False
    full_name: Optional[str] = None

class UserCreate(UserBase):
    email: EmailStr
    password: str

class UserUpdate(UserBase):
    password: Optional[str] = None
    email_verified_at: Optional[datetime] = None
    notify_email_assignments: Optional[bool] = None
    notify_email_digest: Optional[bool] = None
    must_change_password: Optional[bool] = None

class UserInDBBase(UserBase):
    id: Optional[UUID] = None

    class Config:
        from_attributes = True

class User(UserInDBBase):
    pass


class UserMe(User):
    """The signed-in user's own view: includes verification status and e-mail preferences (not shown to teammates)."""
    email_verified_at: Optional[datetime] = None
    notify_email_assignments: bool = True
    notify_email_digest: bool = True
    must_change_password: bool = False
