export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
}

export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const TYPING_ROLES = new Set(['textbox', 'combobox', 'searchbox', 'listbox', 'menu', 'menuitem', 'option', 'dialog', 'alertdialog']);

/** True when single-key shortcuts must not fire: the user is typing, or focus sits in a widget that owns the keys. */
export function isTypingTarget(t: TargetLike | null | undefined): boolean {
  if (!t) return false;
  if (t.isContentEditable) return true;
  if (t.tagName && TYPING_TAGS.has(t.tagName.toUpperCase())) return true;
  const role = t.getAttribute?.('role');
  return role ? TYPING_ROLES.has(role) : false;
}

export const isPaletteShortcut = (e: KeyLike): boolean =>
  e.key.toLowerCase() === 'k' && Boolean(e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;

export type ShortcutAction =
  | { type: 'create-task' }
  | { type: 'show-help' }
  | { type: 'go'; to: '/projects' | '/tasks' | '/' };

const GO_TARGETS: Record<string, '/projects' | '/tasks' | '/'> = { p: '/projects', t: '/tasks', d: '/' };
export const CHORD_TIMEOUT_MS = 1200;

export interface ChordState {
  /** timestamp of a pending `g`, or null */
  goAt: number | null;
}

export const INITIAL_CHORD: ChordState = { goAt: null };

/**
 * Pure state machine for the single-key shortcuts: `c`, `?`, and the chord `g` then `p`/`t`/`d`.
 * Returns the next state and the action to run, if any. Modified keys and typing contexts never trigger.
 */
export function stepShortcut(
  state: ChordState,
  e: KeyLike,
  target: TargetLike | null | undefined,
  now: number,
): { state: ChordState; action: ShortcutAction | null } {
  const idle = { state: INITIAL_CHORD, action: null };
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(target)) return idle;

  const pending = state.goAt !== null && now - state.goAt <= CHORD_TIMEOUT_MS;
  if (pending) {
    const to = GO_TARGETS[e.key.toLowerCase()];
    if (to) return { state: INITIAL_CHORD, action: { type: 'go', to } };
  }
  if (e.key === 'g') return { state: { goAt: now }, action: null };
  if (e.key === 'c') return { state: INITIAL_CHORD, action: { type: 'create-task' } };
  if (e.key === '?') return { state: INITIAL_CHORD, action: { type: 'show-help' } };
  return idle;
}

export const SHORTCUT_LIST: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl/⌘', 'K'], label: 'Open command palette' },
  { keys: ['?'], label: 'Show this shortcut list' },
  { keys: ['c'], label: 'Create task' },
  { keys: ['g', 'p'], label: 'Go to projects' },
  { keys: ['g', 't'], label: 'Go to tasks' },
  { keys: ['g', 'd'], label: 'Go to dashboard' },
  { keys: ['↑', '↓'], label: 'Move through palette results' },
  { keys: ['Enter'], label: 'Run the highlighted palette item' },
  { keys: ['Esc'], label: 'Close palette / dialog' },
];
