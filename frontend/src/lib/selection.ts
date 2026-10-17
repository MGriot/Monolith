// Multi-select helpers for task tables: click toggles, shift-click selects the range back to the last click.

export interface SelectionState {
  selected: ReadonlySet<string>;
  /** the row last clicked; a shift-click extends from here */
  anchor: string | null;
}

export const EMPTY_SELECTION: SelectionState = { selected: new Set(), anchor: null };

/**
 * Apply a click on `id`. `order` is the rows as currently displayed (top to bottom).
 * A shift-click gives every row between the anchor and `id` (inclusive) the state `id` is switching to.
 */
export function clickSelection(state: SelectionState, order: readonly string[], id: string, shift: boolean): SelectionState {
  const next = new Set(state.selected);
  const turnOn = !state.selected.has(id);
  const from = state.anchor === null ? -1 : order.indexOf(state.anchor);
  const to = order.indexOf(id);
  if (shift && from !== -1 && to !== -1) {
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    for (const rowId of order.slice(lo, hi + 1)) {
      if (turnOn) next.add(rowId);
      else next.delete(rowId);
    }
  } else if (turnOn) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return { selected: next, anchor: id };
}

/** Header checkbox: select every displayed row, or clear when they are all selected already. */
export function toggleAll(state: SelectionState, order: readonly string[]): SelectionState {
  const all = order.length > 0 && order.every((id) => state.selected.has(id));
  return { selected: all ? new Set() : new Set(order), anchor: null };
}

/** Forget selected ids that are no longer displayed (filtered out, deleted, archived). */
export function pruneSelection(state: SelectionState, order: readonly string[]): SelectionState {
  const visible = new Set(order);
  let changed = false;
  const next = new Set<string>();
  state.selected.forEach((id) => (visible.has(id) ? next.add(id) : (changed = true)));
  if (!changed) return state;
  return { selected: next, anchor: state.anchor && visible.has(state.anchor) ? state.anchor : null };
}

export type AllNoneSome = 'all' | 'none' | 'some';
export function headerState(state: SelectionState, order: readonly string[]): AllNoneSome {
  const n = order.filter((id) => state.selected.has(id)).length;
  if (n === 0) return 'none';
  return n === order.length ? 'all' : 'some';
}

interface TreeNode {
  id: string;
  subtasks?: TreeNode[] | null;
}

/** Row ids in display order (depth first); children of a collapsed row are not displayed. */
export function visibleIds(tasks: readonly TreeNode[], collapsed: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  const walk = (list: readonly TreeNode[]) => {
    for (const t of list) {
      out.push(t.id);
      if (t.subtasks?.length && !collapsed.has(t.id)) walk(t.subtasks);
    }
  };
  walk(tasks);
  return out;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface BulkResult {
  id: string;
  ok: boolean;
  status_code: number;
  detail?: string | null;
}

export interface BulkSummary {
  succeeded: number;
  failed: number;
  /** distinct failure reasons with how many tasks each affected, most frequent first */
  reasons: { detail: string; count: number }[];
}

export function summarizeBulk(results: readonly BulkResult[]): BulkSummary {
  const counts = new Map<string, number>();
  let succeeded = 0;
  for (const r of results) {
    if (r.ok) succeeded++;
    else counts.set(r.detail || `HTTP ${r.status_code}`, (counts.get(r.detail || `HTTP ${r.status_code}`) ?? 0) + 1);
  }
  const reasons = [...counts].map(([detail, count]) => ({ detail, count })).sort((a, b) => b.count - a.count);
  return { succeeded, failed: results.length - succeeded, reasons };
}
