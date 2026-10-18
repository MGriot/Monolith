"""File Hub: moving folders/files, deleting files, topic tags (no database).

Run:  pytest backend/tests/test_file_hub.py
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import access, deps
from app.api.api_v1.endpoints import folders
from app.core.file_hub import creates_cycle, same_scope
from app.main import app
from app.schemas.file import FileUpdate
from app.schemas.folder import FolderUpdate

A, B, C, D = (uuid4() for _ in range(4))


# --------------------------------------------------------------------------- pure rules
class TestCreatesCycle:
    # A
    # └── B
    #     └── C
    parents = {A: None, B: A, C: B, D: None}

    def test_moving_into_own_descendant_is_a_cycle(self):
        assert creates_cycle(A, C, self.parents)
        assert creates_cycle(B, C, self.parents)

    def test_moving_into_itself_is_a_cycle(self):
        assert creates_cycle(B, B, self.parents)

    def test_moving_sideways_or_to_root_is_fine(self):
        assert not creates_cycle(C, D, self.parents)
        assert not creates_cycle(C, A, self.parents)
        assert not creates_cycle(B, None, self.parents)

    def test_a_loop_already_in_the_data_counts_as_a_cycle(self):
        assert creates_cycle(D, A, {A: B, B: A, D: None})


class TestSameScope:
    def ns(self, **kw):
        return SimpleNamespace(**{"project_id": None, "task_id": None, "owner_id": None, **kw})

    def test_same_project(self):
        assert same_scope(self.ns(project_id=A), self.ns(project_id=A))
        assert not same_scope(self.ns(project_id=A), self.ns(project_id=B))

    def test_project_and_task_folders_do_not_mix(self):
        assert not same_scope(self.ns(project_id=A), self.ns(project_id=A, task_id=C))

    def test_personal_folders_stay_with_their_owner(self):
        assert same_scope(self.ns(owner_id=A), self.ns(owner_id=A))
        assert not same_scope(self.ns(owner_id=A), self.ns(owner_id=B))
        assert not same_scope(self.ns(owner_id=A), self.ns(project_id=B, owner_id=A))


def test_update_schemas_accept_moves_and_tags():
    assert FileUpdate(folder_id=A, topic_ids=[B]).model_dump(exclude_unset=True) == {"folder_id": A, "topic_ids": [B]}
    # an explicit null parent means "move to the top level", so it must survive exclude_unset
    assert FolderUpdate(parent_id=None).model_dump(exclude_unset=True) == {"parent_id": None}
    assert FolderUpdate(name="x").model_dump(exclude_unset=True) == {"name": "x"}


# --------------------------------------------------------------------------- endpoints
@pytest.fixture
def db():
    return MagicMock()


@pytest.fixture
def client(db):
    async def fake_db():
        yield db

    app.dependency_overrides[deps.get_db] = fake_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def user(client):
    u = SimpleNamespace(id=uuid4(), email="u@example.com", is_active=True, is_superuser=False)
    app.dependency_overrides[deps.get_current_user] = lambda: u
    return u


def test_file_endpoints_require_login(client):
    assert client.put(f"/api/v1/folders/files/{A}", json={"name": "x"}).status_code == 401
    assert client.delete(f"/api/v1/folders/files/{A}").status_code == 401


def test_non_member_cannot_delete_or_move(client, user, db, monkeypatch):
    db.get = AsyncMock(return_value=SimpleNamespace(id=A, folder_id=B, owner_id=user.id, url="/uploads/x.png"))

    async def fake_row(db_, model, obj_id, *cols):
        return SimpleNamespace(id=obj_id, project_id=uuid4(), owner_id=uuid4(), task_id=None)

    async def no(*a, **k):
        return False

    monkeypatch.setattr(access, "_row", fake_row)
    monkeypatch.setattr(access, "has_project_access", no)
    assert client.delete(f"/api/v1/folders/files/{A}").status_code == 403
    assert client.put(f"/api/v1/folders/files/{A}", json={"folder_id": str(C)}).status_code == 403


def test_cannot_move_a_file_to_another_project(client, user, db, monkeypatch):
    db.get = AsyncMock(return_value=SimpleNamespace(id=A, folder_id=B, owner_id=user.id))
    scopes = {B: SimpleNamespace(id=B, project_id=uuid4(), task_id=None, owner_id=user.id),
              C: SimpleNamespace(id=C, project_id=uuid4(), task_id=None, owner_id=user.id)}

    async def allow(db_, folder_id, user_, write=False):
        return scopes[folder_id]

    monkeypatch.setattr(folders, "require_folder_access", allow)
    r = client.put(f"/api/v1/folders/files/{A}", json={"folder_id": str(C)})
    assert r.status_code == 400
    assert "same project" in r.json()["detail"]


def test_cannot_move_a_folder_into_its_own_subfolder(client, user, db, monkeypatch):
    project = uuid4()
    moving = SimpleNamespace(id=A, parent_id=None, project_id=project, task_id=None, owner_id=user.id)
    child = SimpleNamespace(id=B, parent_id=A, project_id=project, task_id=None, owner_id=user.id)
    db.get = AsyncMock(return_value=moving)
    rows = MagicMock()
    rows.all.return_value = [SimpleNamespace(id=A, parent_id=None), SimpleNamespace(id=B, parent_id=A)]
    db.execute = AsyncMock(return_value=rows)

    async def allow(db_, folder_id, user_, write=False):
        return {A: moving, B: child}[folder_id]

    monkeypatch.setattr(folders, "require_folder_access", allow)
    r = client.put(f"/api/v1/folders/{A}", json={"parent_id": str(B)})
    assert r.status_code == 400
    assert "subfolders" in r.json()["detail"]


def test_only_the_owner_deletes_a_file(client, user, db, monkeypatch):
    db.get = AsyncMock(return_value=SimpleNamespace(id=A, folder_id=B, owner_id=uuid4(), url="/uploads/x.png"))
    monkeypatch.setattr(folders, "require_folder_access", AsyncMock(return_value=SimpleNamespace(id=B)))
    assert client.delete(f"/api/v1/folders/files/{A}").status_code == 403


# --------------------------------------------------------------------------- notes
def test_create_note_keeps_the_text_it_was_given(monkeypatch):
    import asyncio

    added = []
    db = MagicMock()
    db.add = added.append
    db.commit = AsyncMock()
    monkeypatch.setattr(folders, "require_folder_access", AsyncMock())
    monkeypatch.setattr(folders, "_load_file", AsyncMock(side_effect=lambda _db, _id: added[0]))
    user = SimpleNamespace(id=uuid4())

    note = asyncio.run(folders.create_note(db=db, folder_id=uuid4(), current_user=user,
                                           note_in=FileUpdate(name="Runbook.md", content="# Cut-over\nStep 1")))
    assert note.content == "# Cut-over\nStep 1" and note.name == "Runbook.md"

    added.clear()
    blank = asyncio.run(folders.create_note(db=db, folder_id=uuid4(), current_user=user, note_in=FileUpdate()))
    assert blank.content.startswith("# New Note")
