import { DEFAULT_FILTERS, GROUP_KEYS, SORT_KEYS, type TaskFilters } from './task-filters';

export interface SavedView {
  id: string;
  name: string;
  filters: TaskFilters;
}

/** The subset of `Storage` we need, so tests can pass a plain fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Which list a view belongs to, e.g. `my-tasks` or `project-tasks`. */
export type ViewScope = string;

const storageKey = (scope: ViewScope) => `monolith.saved-views.${scope}`;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Defensive coercion: localStorage content is user-editable and may come from an older version. */
function toFilters(raw: unknown): TaskFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sort = (SORT_KEYS as readonly unknown[]).includes(r.sort) ? (r.sort as TaskFilters['sort']) : DEFAULT_FILTERS.sort;
  const group = (GROUP_KEYS as readonly unknown[]).includes(r.group) ? (r.group as TaskFilters['group']) : DEFAULT_FILTERS.group;
  return {
    q: typeof r.q === 'string' ? r.q : '',
    status: strings(r.status),
    priority: strings(r.priority),
    assignee: strings(r.assignee),
    sort,
    dir: r.dir === 'desc' ? 'desc' : 'asc',
    group,
  };
}

export function loadViews(store: KeyValueStore | null, scope: ViewScope): SavedView[] {
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(storageKey(scope)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is { id: string; name: string; filters?: unknown } =>
        Boolean(v) && typeof v.id === 'string' && typeof v.name === 'string' && v.name.trim() !== '')
      .map((v) => ({ id: v.id, name: v.name, filters: toFilters(v.filters) }));
  } catch {
    return [];
  }
}

function persist(store: KeyValueStore | null, scope: ViewScope, views: SavedView[]): SavedView[] {
  try {
    store?.setItem(storageKey(scope), JSON.stringify(views));
  } catch {
    // quota exceeded / storage disabled: views then live for this session only
  }
  return views;
}

/** Saves under `name`; an existing view with the same name (case-insensitive) is overwritten in place. */
export function saveView(
  store: KeyValueStore | null,
  scope: ViewScope,
  name: string,
  filters: TaskFilters,
  makeId: () => string = () => crypto.randomUUID(),
): SavedView[] {
  const clean = name.trim().slice(0, 60);
  const views = loadViews(store, scope);
  if (!clean) return views;
  const i = views.findIndex((v) => v.name.toLowerCase() === clean.toLowerCase());
  const next: SavedView = { id: i >= 0 ? views[i].id : makeId(), name: clean, filters };
  return persist(store, scope, i >= 0 ? views.map((v, j) => (j === i ? next : v)) : [...views, next]);
}

export function deleteView(store: KeyValueStore | null, scope: ViewScope, id: string): SavedView[] {
  return persist(store, scope, loadViews(store, scope).filter((v) => v.id !== id));
}

/** The saved view whose filters equal the current ones, if any (for highlighting it in the menu). */
export function findMatchingView(views: SavedView[], filters: TaskFilters): SavedView | undefined {
  const key = JSON.stringify(toFilters(filters));
  return views.find((v) => JSON.stringify(v.filters) === key);
}
