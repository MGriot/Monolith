"""Live whiteboard rooms: everyone with a board open shares one in-memory scene, relayed over websockets.

One room per whiteboard id. Edits arrive as changed Excalidraw elements and are merged with Excalidraw's own rule
(a higher `version` wins; on a tie the lower `versionNonce` wins), so every client converges on the same scene no
matter the order messages arrive in. The merged scene is written back to the database a few seconds after the last
edit and again when the last person leaves. Rooms live in this process only: run a single backend worker (as the
Dockerfile does) or put a shared broker in front before scaling out.
"""
import asyncio
import hashlib
import itertools
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional
from uuid import UUID

logger = logging.getLogger(__name__)

PERSIST_DELAY_SECONDS = 3.0
POINTER_MIN_INTERVAL = 0.03  # ~30 pointer updates per second per connection, more are dropped
ROLE_RECHECK_SECONDS = 5.0    # roles are re-read this often, so demotions and removals reach open sockets
MAX_ELEMENTS = 20000

# Excalidraw's collaborator palette (background, stroke)
PALETTE = [
    ("#ffc9c9", "#e03131"), ("#b2f2bb", "#2f9e44"), ("#a5d8ff", "#1971c2"), ("#ffec99", "#f08c00"),
    ("#d0bfff", "#6741d9"), ("#99e9f2", "#0c8599"), ("#fcc2d7", "#c2255c"), ("#ffd8a8", "#e8590c"),
]


def color_for(user_id: UUID) -> Dict[str, str]:
    bg, stroke = PALETTE[int(hashlib.sha256(str(user_id).encode()).hexdigest(), 16) % len(PALETTE)]
    return {"background": bg, "stroke": stroke}


def remote_wins(local: Optional[Dict[str, Any]], remote: Dict[str, Any]) -> bool:
    """True when `remote` should replace `local` (Excalidraw's reconciliation rule)."""
    if local is None:
        return True
    lv, rv = int(local.get("version", 0)), int(remote.get("version", 0))
    if rv != lv:
        return rv > lv
    return int(remote.get("versionNonce", 0)) < int(local.get("versionNonce", 0))


@dataclass
class Peer:
    conn_id: str
    user_id: UUID
    name: str
    role: str  # viewer | editor | admin
    color: Dict[str, str]
    joined: int
    send: Callable[[str], Awaitable[None]]
    last_pointer: float = 0.0
    role_checked: float = field(default_factory=time.monotonic)
    revoked: bool = False  # lost access: the socket loop closes the connection

    @property
    def can_edit(self) -> bool:
        return self.role in ("editor", "admin")

    def public(self) -> Dict[str, Any]:
        return {"id": self.conn_id, "user_id": str(self.user_id), "name": self.name, "role": self.role,
                "color": self.color}


@dataclass
class Room:
    whiteboard_id: UUID
    elements: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    files: Dict[str, Any] = field(default_factory=dict)
    peers: Dict[str, Peer] = field(default_factory=dict)
    dirty: bool = False
    persist_task: Optional[asyncio.Task] = None
    loaded: bool = False

    def scene(self) -> List[Dict[str, Any]]:
        # fractional `index` (Excalidraw >= 0.18) orders the z-stack; fall back to arrival order
        items = list(self.elements.values())
        if all(isinstance(e.get("index"), str) for e in items):
            items.sort(key=lambda e: e["index"])
        return items

    def leader(self) -> Optional[str]:
        """The editor who joined first: they refresh the preview image for everyone."""
        editors = [p for p in self.peers.values() if p.can_edit]
        return min(editors, key=lambda p: p.joined).conn_id if editors else None

    def merge(self, incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        accepted = []
        for el in incoming:
            if not isinstance(el, dict) or not isinstance(el.get("id"), str):
                continue
            if el["id"] not in self.elements and len(self.elements) >= MAX_ELEMENTS:
                continue
            if remote_wins(self.elements.get(el["id"]), el):
                self.elements[el["id"]] = el
                accepted.append(el)
        return accepted


Loader = Callable[[UUID], Awaitable[Optional[Dict[str, Any]]]]
Saver = Callable[[UUID, List[Dict[str, Any]], Dict[str, Any]], Awaitable[None]]
RoleLookup = Callable[[UUID, UUID], Awaitable[Optional[str]]]  # (whiteboard, user) -> role, None = no access


async def _load_from_db(whiteboard_id: UUID) -> Optional[Dict[str, Any]]:
    from app.db.session import AsyncSessionLocal
    from app.models.whiteboard import Whiteboard

    async with AsyncSessionLocal() as db:
        wb = await db.get(Whiteboard, whiteboard_id)
        return dict(wb.data or {}) if wb else None


async def _save_to_db(whiteboard_id: UUID, elements: List[Dict[str, Any]], files: Dict[str, Any]) -> None:
    from app.db.session import AsyncSessionLocal
    from app.models.whiteboard import Whiteboard

    async with AsyncSessionLocal() as db:
        wb = await db.get(Whiteboard, whiteboard_id)
        if wb is None:
            return
        data = dict(wb.data or {})
        data.update({"type": "excalidraw", "version": 2, "elements": [e for e in elements if not e.get("isDeleted")],
                     "files": files})
        wb.data = data  # new dict: JSONB change detection needs a fresh object
        await db.commit()


async def _role_from_db(whiteboard_id: UUID, user_id: UUID) -> Optional[str]:
    from app.api.access import project_role
    from app.db.session import AsyncSessionLocal
    from app.models.user import User
    from app.models.whiteboard import Whiteboard

    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        wb = await db.get(Whiteboard, whiteboard_id)
        if not user or not user.is_active or not wb:
            return None
        role = await project_role(db, wb.project_id, user)
        if role is None and wb.owner_id == user.id:
            return "viewer"  # the owner may still look at their own board
        return role


class RoomManager:
    def __init__(self, loader: Loader = _load_from_db, saver: Saver = _save_to_db,
                 persist_delay: float = PERSIST_DELAY_SECONDS, role_lookup: Optional[RoleLookup] = _role_from_db,
                 role_recheck: float = ROLE_RECHECK_SECONDS):
        self.rooms: Dict[UUID, Room] = {}
        self._loader = loader
        self._saver = saver
        self._delay = persist_delay
        self._role_lookup = role_lookup
        self._role_recheck = role_recheck
        self._seq = itertools.count(1)
        self._lock = asyncio.Lock()

    # --- membership ------------------------------------------------------------------------------------------
    async def join(self, whiteboard_id: UUID, *, user_id: UUID, name: str, role: str,
                   send: Callable[[str], Awaitable[None]]) -> Peer:
        async with self._lock:
            room = self.rooms.get(whiteboard_id)
            if room is None:
                room = self.rooms[whiteboard_id] = Room(whiteboard_id)
            if not room.loaded:
                data = await self._loader(whiteboard_id) or {}
                room.merge(data.get("elements") or [])
                room.files.update(data.get("files") or {})
                room.loaded = True
            seq = next(self._seq)
            peer = Peer(conn_id=f"c{seq}", user_id=user_id, name=name, role=role, color=color_for(user_id),
                        joined=seq, send=send)
            room.peers[peer.conn_id] = peer
        await self._send(peer, {"type": "init", "self": peer.public(), "role": role, "elements": room.scene(),
                                "files": room.files, "peers": [p.public() for p in room.peers.values()],
                                "leader": room.leader()})
        await self._broadcast_peers(room)
        return peer

    async def leave(self, whiteboard_id: UUID, peer: Peer) -> None:
        room = self.rooms.get(whiteboard_id)
        if not room or room.peers.pop(peer.conn_id, None) is None:
            return
        if room.peers:
            await self._broadcast_peers(room)
            return
        # last one out: flush and forget the room
        if room.persist_task:
            room.persist_task.cancel()
        await self._flush(room)
        self.rooms.pop(whiteboard_id, None)

    # --- messages --------------------------------------------------------------------------------------------
    async def handle(self, whiteboard_id: UUID, peer: Peer, raw: str) -> None:
        room = self.rooms.get(whiteboard_id)
        if room is None:
            return
        try:
            msg = json.loads(raw)
        except ValueError:
            return
        if not isinstance(msg, dict):
            return
        if not await self._refresh_role(room, peer):
            return
        kind = msg.get("type")
        if kind == "ping":
            await self._send(peer, {"type": "pong"})
        elif kind == "pointer":
            now = time.monotonic()
            if now - peer.last_pointer < POINTER_MIN_INTERVAL:
                return
            peer.last_pointer = now
            pointer = msg.get("pointer") or {}
            try:
                payload = {"type": "pointer", "peer": peer.conn_id,
                           "pointer": {"x": float(pointer.get("x", 0)), "y": float(pointer.get("y", 0)),
                                       "tool": "laser" if pointer.get("tool") == "laser" else "pointer"},
                           "button": "down" if msg.get("button") == "down" else "up"}
            except (TypeError, ValueError):
                return
            await self._broadcast(room, payload, exclude=peer.conn_id)
        elif kind == "scene_update":
            if not peer.can_edit:
                await self._send(peer, {"type": "error", "message": "You can only view this sketch."})
                return
            elements = msg.get("elements")
            if not isinstance(elements, list):
                return
            accepted = room.merge(elements)
            if accepted:
                await self._broadcast(room, {"type": "scene_update", "elements": accepted}, exclude=peer.conn_id)
                self._schedule_persist(room)
        elif kind == "files":
            if not peer.can_edit:
                return
            files = msg.get("files")
            if not isinstance(files, dict):
                return
            fresh = {k: v for k, v in files.items() if isinstance(k, str) and k not in room.files}
            if fresh:
                room.files.update(fresh)
                await self._broadcast(room, {"type": "files", "files": fresh}, exclude=peer.conn_id)
                self._schedule_persist(room)

    async def replace_scene(self, whiteboard_id: UUID, data: Dict[str, Any]) -> None:
        """A REST/MCP write replaced the scene while people are in the room: adopt it and tell them."""
        room = self.rooms.get(whiteboard_id)
        if room is None:
            return
        room.elements = {}
        room.merge(data.get("elements") or [])
        room.files = dict(data.get("files") or {})
        await self._broadcast(room, {"type": "scene_replace", "elements": room.scene(), "files": room.files})

    def online_user_ids(self, whiteboard_id: UUID) -> List[str]:
        room = self.rooms.get(whiteboard_id)
        return sorted({str(p.user_id) for p in room.peers.values()}) if room else []

    # --- internals -------------------------------------------------------------------------------------------
    async def _refresh_role(self, room: Room, peer: Peer) -> bool:
        """Re-read the peer's project role now and then; False (and `revoked`) once access is gone."""
        if self._role_lookup is None or time.monotonic() - peer.role_checked < self._role_recheck:
            return not peer.revoked
        peer.role_checked = time.monotonic()
        role = await self._role_lookup(room.whiteboard_id, peer.user_id)
        if role is None:
            peer.revoked = True
            await self._send(peer, {"type": "error", "message": "You no longer have access to this sketch."})
            return False
        if role != peer.role:
            peer.role = role
            await self._send(peer, {"type": "role", "role": role})
            await self._broadcast_peers(room)
        return True

    def _schedule_persist(self, room: Room) -> None:
        room.dirty = True
        if room.persist_task and not room.persist_task.done():
            room.persist_task.cancel()
        room.persist_task = asyncio.create_task(self._persist_later(room))

    async def _persist_later(self, room: Room) -> None:
        try:
            await asyncio.sleep(self._delay)
        except asyncio.CancelledError:
            return
        await self._flush(room)

    async def _flush(self, room: Room) -> None:
        if not room.dirty:
            return
        room.dirty = False
        try:
            await self._saver(room.whiteboard_id, room.scene(), room.files)
        except Exception:  # keep the room alive; the next edit or leave retries
            room.dirty = True
            logger.exception("Could not save whiteboard %s", room.whiteboard_id)

    async def _broadcast_peers(self, room: Room) -> None:
        await self._broadcast(room, {"type": "peers", "peers": [p.public() for p in room.peers.values()],
                                     "leader": room.leader()})

    async def _broadcast(self, room: Room, message: Dict[str, Any], exclude: Optional[str] = None) -> None:
        text = json.dumps(message)
        for peer in list(room.peers.values()):
            if peer.conn_id != exclude:
                await self._send(peer, text)

    @staticmethod
    async def _send(peer: Peer, message) -> None:
        try:
            await peer.send(message if isinstance(message, str) else json.dumps(message))
        except Exception:  # a dead socket is cleaned up by its own receive loop
            pass


rooms = RoomManager()
