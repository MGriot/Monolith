"""A topic / work type name already used in its scope is a 409 (the unique indexes from migration 0014), not a 500."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.api.api_v1.endpoints import metadata
from app.schemas.metadata import TopicCreate, WorkTypeCreate


def _duplicate(*_args, **_kwargs):
    raise IntegrityError("INSERT", {}, Exception("duplicate key value violates unique constraint"))


@pytest.mark.asyncio
async def test_duplicate_topic_name_is_409():
    db = AsyncMock()
    with patch.object(metadata.crud_metadata.topic, "create", AsyncMock(side_effect=_duplicate)):
        with pytest.raises(HTTPException) as exc:
            await metadata.create_topic(db=db, topic_in=TopicCreate(name="Research"), current_user=None)
    assert exc.value.status_code == 409
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_duplicate_work_type_name_is_409():
    db = AsyncMock()
    with patch.object(metadata.crud_metadata.work_type, "create", AsyncMock(side_effect=_duplicate)):
        with pytest.raises(HTTPException) as exc:
            await metadata.create_work_type(db=db, work_type_in=WorkTypeCreate(name="Dev"), current_user=None)
    assert exc.value.status_code == 409
