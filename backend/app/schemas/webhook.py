from typing import Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict

class WebhookBase(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    provider: Optional[str] = "slack"
    is_active: Optional[bool] = True
    project_id: Optional[UUID] = None

class WebhookCreate(WebhookBase):
    name: str
    url: str

class WebhookUpdate(WebhookBase):
    pass

class WebhookInDBBase(WebhookBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class Webhook(WebhookInDBBase):
    pass
