"""Live whiteboard rooms: merge rule, permissions, presence and saving (no database, no sockets).

Run:  pytest backend/tests/test_whiteboard_rooms.py
"""
import asyncio
import json
from uuid import uuid4

from app.core.whiteboard_rooms import RoomManager, color_for, remote_wins


def el(eid, version, nonce=1, **kw):
    return {"id": eid, "version": version, "versionNonce": nonce, "type": "rectangle", **kw}


class Inbox:
    def __init__(self):
        self.messages = []

    async def send(self, text):
        self.messages.append(json.loads(text))

    def of(self, kind):
        return [m for m in self.messages if m["type"] == kind]


def manager(initial=None, delay=0.01, roles=None):
    saved = []

    async def loader(wid):
        return {"elements": initial or [], "files": {}}

    async def saver(wid, elements, files):
        saved.append((wid, [dict(e) for e in elements], dict(files)))

    async def role_lookup(wid, uid):
        return roles.get(uid, "viewer") if roles is not None else None

    lookup = role_lookup if roles is not None else None
    return RoomManager(loader=loader, saver=saver, persist_delay=delay, role_lookup=lookup, role_recheck=0), saved


class TestMergeRule:
    def test_new_element_wins(self):
        assert remote_wins(None, el("a", 1))

    def test_higher_version_wins(self):
        assert remote_wins(el("a", 1), el("a", 2))
        assert not remote_wins(el("a", 3), el("a", 2))

    def test_tie_goes_to_the_lower_nonce(self):
        assert remote_wins(el("a", 2, nonce=50), el("a", 2, nonce=10))
        assert not remote_wins(el("a", 2, nonce=10), el("a", 2, nonce=50))
        assert not remote_wins(el("a", 2, nonce=10), el("a", 2, nonce=10))

    def test_colours_are_stable_per_user(self):
        uid = uuid4()
        assert color_for(uid) == color_for(uid)


class TestRoom:
    def test_join_sends_scene_presence_and_leader(self):
        async def scenario():
            rooms, _ = manager(initial=[el("a", 1)])
            wid, alice, bob = uuid4(), Inbox(), Inbox()
            pa = await rooms.join(wid, user_id=uuid4(), name="Alice", role="editor", send=alice.send)
            pb = await rooms.join(wid, user_id=uuid4(), name="Bob", role="viewer", send=bob.send)
            init = bob.of("init")[0]
            assert [e["id"] for e in init["elements"]] == ["a"]
            assert {p["name"] for p in init["peers"]} == {"Alice", "Bob"}
            assert init["role"] == "viewer" and init["leader"] == pa.conn_id
            assert {p["name"] for p in alice.of("peers")[-1]["peers"]} == {"Alice", "Bob"}
            await rooms.leave(wid, pb)
            assert [p["name"] for p in alice.of("peers")[-1]["peers"]] == ["Alice"]
        asyncio.run(scenario())

    def test_editor_changes_reach_others_but_not_the_sender(self):
        async def scenario():
            rooms, _ = manager()
            wid, alice, bob = uuid4(), Inbox(), Inbox()
            pa = await rooms.join(wid, user_id=uuid4(), name="Alice", role="editor", send=alice.send)
            await rooms.join(wid, user_id=uuid4(), name="Bob", role="editor", send=bob.send)
            await rooms.handle(wid, pa, json.dumps({"type": "scene_update", "elements": [el("x", 1)]}))
            assert bob.of("scene_update")[0]["elements"][0]["id"] == "x"
            assert not alice.of("scene_update")
            # a stale copy is not accepted, so nothing is relayed
            await rooms.handle(wid, pa, json.dumps({"type": "scene_update", "elements": [el("x", 1)]}))
            assert len(bob.of("scene_update")) == 1
        asyncio.run(scenario())

    def test_viewers_cannot_edit(self):
        async def scenario():
            rooms, saved = manager()
            wid, alice, bob = uuid4(), Inbox(), Inbox()
            await rooms.join(wid, user_id=uuid4(), name="Alice", role="editor", send=alice.send)
            pb = await rooms.join(wid, user_id=uuid4(), name="Bob", role="viewer", send=bob.send)
            await rooms.handle(wid, pb, json.dumps({"type": "scene_update", "elements": [el("x", 1)]}))
            await rooms.handle(wid, pb, json.dumps({"type": "files", "files": {"f": {"id": "f"}}}))
            assert bob.of("error") and not alice.of("scene_update") and not alice.of("files")
            await asyncio.sleep(0.03)
            assert saved == []
        asyncio.run(scenario())

    def test_pointers_are_relayed_and_sanitised(self):
        async def scenario():
            rooms, _ = manager()
            wid, alice, bob = uuid4(), Inbox(), Inbox()
            pa = await rooms.join(wid, user_id=uuid4(), name="Alice", role="viewer", send=alice.send)
            await rooms.join(wid, user_id=uuid4(), name="Bob", role="editor", send=bob.send)
            await rooms.handle(wid, pa, json.dumps({"type": "pointer", "pointer": {"x": 3, "y": 4, "tool": "<b>"}, "button": "down"}))
            msg = bob.of("pointer")[0]
            assert msg["peer"] == pa.conn_id and msg["pointer"] == {"x": 3.0, "y": 4.0, "tool": "pointer"}
            assert msg["button"] == "down"
        asyncio.run(scenario())

    def test_saves_after_a_pause_and_when_the_last_person_leaves(self):
        async def scenario():
            rooms, saved = manager(delay=0.01)
            wid, alice = uuid4(), Inbox()
            pa = await rooms.join(wid, user_id=uuid4(), name="Alice", role="admin", send=alice.send)
            await rooms.handle(wid, pa, json.dumps({"type": "scene_update", "elements": [el("x", 1), el("y", 1)]}))
            await asyncio.sleep(0.05)
            assert len(saved) == 1 and {e["id"] for e in saved[0][1]} == {"x", "y"}
            await rooms.handle(wid, pa, json.dumps({"type": "scene_update", "elements": [el("x", 2, isDeleted=True)]}))
            await rooms.leave(wid, pa)
            assert len(saved) == 2 and saved[1][1][0]["isDeleted"] is True
            assert wid not in rooms.rooms
        asyncio.run(scenario())

    def test_api_writes_replace_the_live_scene(self):
        async def scenario():
            rooms, _ = manager(initial=[el("old", 5)])
            wid, alice = uuid4(), Inbox()
            await rooms.join(wid, user_id=uuid4(), name="Alice", role="editor", send=alice.send)
            await rooms.replace_scene(wid, {"elements": [el("new", 1)], "files": {}})
            msg = alice.of("scene_replace")[0]
            assert [e["id"] for e in msg["elements"]] == ["new"]
        asyncio.run(scenario())

    def test_garbage_is_ignored(self):
        async def scenario():
            rooms, _ = manager()
            wid, alice = uuid4(), Inbox()
            pa = await rooms.join(wid, user_id=uuid4(), name="Alice", role="editor", send=alice.send)
            for raw in ("not json", "[]", json.dumps({"type": "scene_update", "elements": "x"}),
                        json.dumps({"type": "scene_update", "elements": [{"no": "id"}]})):
                await rooms.handle(wid, pa, raw)
            await rooms.handle(wid, pa, json.dumps({"type": "ping"}))
            assert alice.of("pong")
        asyncio.run(scenario())


class TestRoleChanges:
    def test_a_demoted_editor_can_no_longer_draw(self):
        async def scenario():
            uid, other = uuid4(), uuid4()
            roles = {uid: "editor", other: "editor"}
            rooms, _ = manager(roles=roles)
            wid, alice, bob = uuid4(), Inbox(), Inbox()
            pa = await rooms.join(wid, user_id=uid, name="Alice", role="editor", send=alice.send)
            await rooms.join(wid, user_id=other, name="Bob", role="editor", send=bob.send)
            roles[uid] = "viewer"
            await rooms.handle(wid, pa, json.dumps({"type": "scene_update", "elements": [el("x", 1)]}))
            assert alice.of("role")[-1]["role"] == "viewer" and alice.of("error")
            assert not bob.of("scene_update")
        asyncio.run(scenario())

    def test_a_removed_member_is_cut_off(self):
        async def scenario():
            uid = uuid4()
            roles = {uid: "editor"}
            rooms, _ = manager(roles=roles)
            wid, alice = uuid4(), Inbox()
            pa = await rooms.join(wid, user_id=uid, name="Alice", role="editor", send=alice.send)
            del roles[uid]
            rooms._role_lookup = lambda w, u: asyncio.sleep(0, result=roles.get(u))
            await rooms.handle(wid, pa, json.dumps({"type": "ping"}))
            assert pa.revoked and not alice.of("pong")
        asyncio.run(scenario())
