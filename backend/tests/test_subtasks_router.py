"""/subtasks create and update go through the /tasks handlers: custom-field validation and ValueError -> 400 included."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.api_v1.endpoints import subtasks as subtasks_api, tasks as tasks_api
from app.schemas.task import TaskCreate, TaskUpdate

USER = SimpleNamespace(id=uuid4(), is_superuser=False)
PROJECT_ID = uuid4()


@pytest.fixture
def parent(monkeypatch):
    row = SimpleNamespace(id=uuid4(), project_id=PROJECT_ID, owner_id=USER.id)
    for module in (subtasks_api, tasks_api):
        monkeypatch.setattr(module, "require_task_access", AsyncMock(return_value=row))
    monkeypatch.setattr(tasks_api, "require_project_access", AsyncMock())
    return row


@pytest.mark.asyncio
async def test_create_validates_custom_values_in_the_parents_project(parent, monkeypatch):
    validate = AsyncMock(return_value={"f": 1})
    create = AsyncMock(return_value="created")
    monkeypatch.setattr(tasks_api.crud_custom_field, "validate_for_project", validate)
    monkeypatch.setattr(tasks_api.crud_task.task, "create", create)

    body = TaskCreate(title="Sub", parent_id=parent.id, project_id=uuid4(), custom_values={"f": "1"})
    assert await subtasks_api.create_subtask(db=AsyncMock(), subtask_in=body, current_user=USER) == "created"

    validate.assert_awaited_once()
    assert validate.await_args.args[1] == PROJECT_ID  # the parent's project, not the one the client sent
    sent = create.await_args.kwargs["obj_in"]
    assert sent.project_id == PROJECT_ID and sent.owner_id == USER.id and sent.custom_values == {"f": 1}


@pytest.mark.asyncio
async def test_update_maps_domain_errors_to_400(parent, monkeypatch):
    monkeypatch.setattr(tasks_api.crud_task.task, "get", AsyncMock(return_value=SimpleNamespace(project_id=PROJECT_ID)))
    monkeypatch.setattr(tasks_api.crud_task.task, "update", AsyncMock(side_effect=ValueError("Task is blocked")))

    with pytest.raises(HTTPException) as exc:
        await subtasks_api.update_subtask(db=AsyncMock(), subtask_id=parent.id, subtask_in=TaskUpdate(title="x"),
                                          current_user=USER)
    assert exc.value.status_code == 400 and exc.value.detail == "Task is blocked"


@pytest.mark.asyncio
async def test_create_still_requires_a_parent():
    with pytest.raises(HTTPException) as exc:
        await subtasks_api.create_subtask(db=AsyncMock(), subtask_in=TaskCreate(title="x"), current_user=USER)
    assert exc.value.status_code == 400
