"""access.require_owner / require_owner_or_shared: the checks templates, SOP workflows and teams share."""
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.access import require_owner, require_owner_or_shared


def user(superuser=False):
    return SimpleNamespace(id=uuid4(), is_superuser=superuser)


OWNER, SHARED, MEMBER, OTHER, ADMIN = user(), user(), user(), user(), user(superuser=True)
OBJ = SimpleNamespace(owner_id=OWNER.id, shared_with=[SHARED], members=[MEMBER])


@pytest.mark.parametrize("who, allowed", [(OWNER, True), (ADMIN, True), (SHARED, False), (MEMBER, False), (OTHER, False)])
def test_require_owner(who, allowed):
    if allowed:
        require_owner(OBJ, who, "no")
    else:
        with pytest.raises(HTTPException) as exc:
            require_owner(OBJ, who, "Only the owner")
        assert (exc.value.status_code, exc.value.detail) == (403, "Only the owner")


@pytest.mark.parametrize("who, also, allowed", [
    (OWNER, (), True), (ADMIN, (), True), (SHARED, (), True), (MEMBER, (), False), (OTHER, (), False),
    (MEMBER, OBJ.members, True), (OTHER, OBJ.members, False),
])
def test_require_owner_or_shared(who, also, allowed):
    if allowed:
        require_owner_or_shared(OBJ, who, "no", also=also)
    else:
        with pytest.raises(HTTPException) as exc:
            require_owner_or_shared(OBJ, who, "Not enough permissions", also=also)
        assert exc.value.status_code == 403
