import { describe, expect, it } from 'vitest';
import { deleteView, findMatchingView, loadViews, saveView, type KeyValueStore } from './saved-views';
import { DEFAULT_FILTERS } from './task-filters';

const fakeStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v; },
  };
};
let n = 0;
const id = () => `id${++n}`;
const high = { ...DEFAULT_FILTERS, priority: ['High'] };

describe('saved views', () => {
  it('saves, loads, and scopes views separately', () => {
    const s = fakeStore();
    saveView(s, 'my-tasks', 'Urgent', high, id);
    expect(loadViews(s, 'my-tasks').map((v) => v.name)).toEqual(['Urgent']);
    expect(loadViews(s, 'project-tasks')).toEqual([]);
  });

  it('overwrites a same-named view (case-insensitive) and keeps its id', () => {
    const s = fakeStore();
    const [first] = saveView(s, 'x', 'Urgent', high, id);
    const views = saveView(s, 'x', ' urgent ', { ...high, q: 'api' }, id);
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe(first.id);
    expect(views[0].filters.q).toBe('api');
  });

  it('ignores blank names and deletes by id', () => {
    const s = fakeStore();
    expect(saveView(s, 'x', '   ', high, id)).toEqual([]);
    const [v] = saveView(s, 'x', 'A', high, id);
    expect(deleteView(s, 'x', v.id)).toEqual([]);
    expect(loadViews(s, 'x')).toEqual([]);
  });

  it('survives corrupt or hostile storage content', () => {
    expect(loadViews(fakeStore({ 'monolith.saved-views.x': '{nope' }), 'x')).toEqual([]);
    expect(loadViews(fakeStore({ 'monolith.saved-views.x': '{"a":1}' }), 'x')).toEqual([]);
    const s = fakeStore({ 'monolith.saved-views.x': JSON.stringify([{ id: '1', name: 'ok', filters: { sort: 'evil', status: [1, 'Todo'] } }, { id: 2 }, null]) });
    const [v] = loadViews(s, 'x');
    expect(loadViews(s, 'x')).toHaveLength(1);
    expect(v.filters.sort).toBe('manual');
    expect(v.filters.status).toEqual(['Todo']);
  });

  it('works with no storage and with a throwing setItem', () => {
    expect(loadViews(null, 'x')).toEqual([]);
    expect(saveView(null, 'x', 'A', high, id)).toHaveLength(1);
    const boom: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(saveView(boom, 'x', 'A', high, id)).toHaveLength(1);
  });

  it('finds the view matching the current filters', () => {
    const s = fakeStore();
    const views = saveView(s, 'x', 'Urgent', high, id);
    expect(findMatchingView(views, { ...high })?.name).toBe('Urgent');
    expect(findMatchingView(views, DEFAULT_FILTERS)).toBeUndefined();
  });
});
