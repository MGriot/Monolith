/**
 * Client for a live whiteboard room (`/api/v1/whiteboards/{id}/ws`).
 *
 * Sends only elements whose version changed since they were last sent or received, throttles pointer moves,
 * reconnects with backoff, and hands everything the server says to the editor through callbacks.
 */

export type CollabRole = 'viewer' | 'editor' | 'admin';

export interface CollabPeer {
  id: string;
  user_id: string;
  name: string;
  role: CollabRole;
  color: { background: string; stroke: string };
}

export interface SceneElement {
  id: string;
  version: number;
  versionNonce: number;
  [key: string]: unknown;
}

export interface CollabHandlers {
  onInit: (msg: { self: CollabPeer; role: CollabRole; elements: SceneElement[]; files: Record<string, unknown>; peers: CollabPeer[]; leader: string | null }) => void;
  onElements: (elements: SceneElement[]) => void;
  onReplace: (elements: SceneElement[], files: Record<string, unknown>) => void;
  onFiles: (files: Record<string, unknown>) => void;
  onPeers: (peers: CollabPeer[], leader: string | null) => void;
  onPointer: (peerId: string, pointer: { x: number; y: number; tool: 'pointer' | 'laser' }, button: 'up' | 'down') => void;
  onStatus: (status: 'connecting' | 'live' | 'offline') => void;
  /** Your project role changed while connected (re-checked by the server every few seconds). */
  onRole?: (role: CollabRole) => void;
  onError?: (message: string) => void;
}

/** Elements that differ from the versions we already know about (and record them as known). */
export function changedElements(elements: readonly SceneElement[], known: Map<string, number>): SceneElement[] {
  const out: SceneElement[] = [];
  for (const el of elements) {
    if (known.get(el.id) !== el.version) {
      known.set(el.id, el.version);
      out.push(el);
    }
  }
  return out;
}

/** Record versions received from others so we don't echo them back. */
export function rememberVersions(elements: readonly SceneElement[], known: Map<string, number>) {
  for (const el of elements) {
    const prev = known.get(el.id);
    if (prev === undefined || el.version >= prev) known.set(el.id, el.version);
  }
}

export function roomUrl(whiteboardId: string, origin: Location = window.location): string {
  const protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${origin.host}/api/v1/whiteboards/${whiteboardId}/ws`;
}

const POINTER_INTERVAL_MS = 50;
const SCENE_INTERVAL_MS = 80;

export class WhiteboardCollab {
  private socket: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPointer = 0;
  private sceneTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingScene: readonly SceneElement[] | null = null;
  private sentFiles = new Set<string>();
  readonly known = new Map<string, number>();

  private whiteboardId: string;
  private token: string;
  private handlers: CollabHandlers;

  constructor(whiteboardId: string, token: string, handlers: CollabHandlers) {
    this.whiteboardId = whiteboardId;
    this.token = token;
    this.handlers = handlers;
  }

  connect() {
    this.closed = false;
    this.handlers.onStatus('connecting');
    const socket = new WebSocket(roomUrl(this.whiteboardId));
    this.socket = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', token: this.token }));
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25000);
    };
    socket.onmessage = (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }
      switch (msg.type) {
        case 'init':
          this.retry = 0;
          this.known.clear();
          rememberVersions(msg.elements, this.known);
          Object.keys(msg.files || {}).forEach((id) => this.sentFiles.add(id));
          this.handlers.onStatus('live');
          this.handlers.onInit(msg);
          break;
        case 'scene_update':
          rememberVersions(msg.elements, this.known);
          this.handlers.onElements(msg.elements);
          break;
        case 'scene_replace':
          this.known.clear();
          rememberVersions(msg.elements, this.known);
          this.handlers.onReplace(msg.elements, msg.files || {});
          break;
        case 'files':
          Object.keys(msg.files || {}).forEach((id) => this.sentFiles.add(id));
          this.handlers.onFiles(msg.files || {});
          break;
        case 'peers':
          this.handlers.onPeers(msg.peers, msg.leader);
          break;
        case 'pointer':
          this.handlers.onPointer(msg.peer, msg.pointer, msg.button);
          break;
        case 'role':
          this.handlers.onRole?.(msg.role);
          break;
        case 'error':
          this.handlers.onError?.(msg.message);
          break;
      }
    };
    socket.onclose = (event) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.socket = null;
      this.handlers.onStatus('offline');
      if (this.closed || event.code === 1008) return; // 1008: no access / token expired, retrying will not help
      const delay = Math.min(15000, 500 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.sceneTimer) clearTimeout(this.sceneTimer);
    this.socket?.close();
    this.socket = null;
  }

  /** Call from Excalidraw's onChange: sends changed elements, batched to a few messages per second. */
  sceneChanged(elements: readonly SceneElement[], files: Record<string, unknown>) {
    this.pendingScene = elements;
    const fresh = Object.entries(files).filter(([id]) => !this.sentFiles.has(id));
    if (fresh.length) {
      fresh.forEach(([id]) => this.sentFiles.add(id));
      this.send({ type: 'files', files: Object.fromEntries(fresh) });
    }
    if (this.sceneTimer) return;
    this.sceneTimer = setTimeout(() => {
      this.sceneTimer = null;
      const pending = this.pendingScene;
      this.pendingScene = null;
      if (!pending) return;
      const changed = changedElements(pending, this.known);
      if (changed.length) this.send({ type: 'scene_update', elements: changed });
    }, SCENE_INTERVAL_MS);
  }

  pointerMoved(pointer: { x: number; y: number; tool?: string }, button: 'up' | 'down') {
    const now = Date.now();
    if (now - this.lastPointer < POINTER_INTERVAL_MS) return;
    this.lastPointer = now;
    this.send({ type: 'pointer', pointer: { x: pointer.x, y: pointer.y, tool: pointer.tool === 'laser' ? 'laser' : 'pointer' }, button });
  }

  private send(message: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
