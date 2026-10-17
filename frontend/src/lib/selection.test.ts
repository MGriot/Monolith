import { describe, expect, it } from 'vitest';
import {
  chunk,
  clickSelection,
  EMPTY_SELECTION,
  headerState,
  pruneSelection,
  summarizeBulk,
  toggleAll,
  visibleIds,
  type SelectionState,
} from './selection';

const order = ['a', 'b', 'c', 'd', 'e'];
const sel = (ids: string[], anchor: string | null = null): SelectionState => ({ selected: new Set(ids), anchor });
const ids = (s: SelectionState) => [...s.selected].sort();

describe('click selection', () => {
  it('toggles a single row and remembers the anchor', () => {
    const one = clickSelection(EMPTY_SELECTION, order, 'b', false);
    expect(ids(one)).toEqual(['b']);
    expect(one.anchor).toBe('b');
    expect(ids(clickSelection(one, order, 'b', false))).toEqual([]);
  });

  it('shift-click selects the range from the anchor, either direction', () => {
    const start = clickSelection(EMPTY_SELECTION, order, 'b', false);
    expect(ids(clickSelection(start, order, 'd', true))).toEqual(['b', 'c', 'd']);
    expect(ids(clickSelection(clickSelection(EMPTY_SELECTION, order, 'd', false), order, 'b', true))).toEqual(['b', 'c', 'd']);
  });

  it('shift-click on a selected row clears the range', () => {
    const all = sel(order, 'a');
    expect(ids(clickSelection(all, order, 'c', true))).toEqual(['d', 'e']);
  });

  it('shift-click keeps rows outside the range', () => {
    const s = sel(['a', 'e'], 'b');
    expect(ids(clickSelection(s, order, 'c', true))).toEqual(['a', 'b', 'c', 'e']);
  });

  it('shift-click without a usable anchor behaves like a plain click', () => {
    expect(ids(clickSelection(EMPTY_SELECTION, order, 'c', true))).toEqual(['c']);
    expect(ids(clickSelection(sel([], 'gone'), order, 'c', true))).toEqual(['c']);
  });

  it('does not mutate the previous state', () => {
    const before = sel(['a'], 'a');
    clickSelection(before, order, 'c', true);
    expect(ids(before)).toEqual(['a']);
  });
});

describe('header checkbox and pruning', () => {
  it('selects all, then clears', () => {
    const all = toggleAll(EMPTY_SELECTION, order);
    expect(ids(all)).toEqual(order);
    expect(ids(toggleAll(all, order))).toEqual([]);
    expect(ids(toggleAll(sel(['a']), order))).toEqual(order);
    expect(ids(toggleAll(EMPTY_SELECTION, []))).toEqual([]);
  });

  it('reports none / some / all', () => {
    expect(headerState(EMPTY_SELECTION, order)).toBe('none');
    expect(headerState(sel(['a']), order)).toBe('some');
    expect(headerState(sel(order), order)).toBe('all');
  });

  it('drops ids that are no longer displayed', () => {
    const pruned = pruneSelection(sel(['a', 'z'], 'z'), order);
    expect(ids(pruned)).toEqual(['a']);
    expect(pruned.anchor).toBeNull();
    const same = sel(['a'], 'a');
    expect(pruneSelection(same, order)).toBe(same);
  });
});

describe('visible order', () => {
  const tree = [
    { id: '1', subtasks: [{ id: '1.1' }, { id: '1.2', subtasks: [{ id: '1.2.1' }] }] },
    { id: '2' },
  ];
  it('is depth first', () => {
    expect(visibleIds(tree)).toEqual(['1', '1.1', '1.2', '1.2.1', '2']);
  });
  it('skips children of collapsed rows', () => {
    expect(visibleIds(tree, new Set(['1']))).toEqual(['1', '2']);
    expect(visibleIds(tree, new Set(['1.2']))).toEqual(['1', '1.1', '1.2', '2']);
  });
});

describe('bulk helpers', () => {
  it('chunks to the server cap', () => {
    const many = Array.from({ length: 450 }, (_, i) => String(i));
    expect(chunk(many, 200).map((c) => c.length)).toEqual([200, 200, 50]);
    expect(chunk([], 200)).toEqual([]);
  });

  it('summarises partial failures by reason', () => {
    const s = summarizeBulk([
      { id: '1', ok: true, status_code: 200 },
      { id: '2', ok: false, status_code: 403, detail: 'Not enough permissions for this task' },
      { id: '3', ok: false, status_code: 403, detail: 'Not enough permissions for this task' },
      { id: '4', ok: false, status_code: 400, detail: 'blocked' },
      { id: '5', ok: false, status_code: 500 },
    ]);
    expect(s.succeeded).toBe(1);
    expect(s.failed).toBe(4);
    expect(s.reasons[0]).toEqual({ detail: 'Not enough permissions for this task', count: 2 });
    expect(s.reasons.map((r) => r.detail)).toContain('HTTP 500');
  });
});
