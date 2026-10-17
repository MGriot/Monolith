export const SORT_KEYS = ['manual', 'due', 'priority', 'status', 'title', 'created'] as const;
export const GROUP_KEYS = ['none', 'status', 'priority', 'assignee'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type GroupKey = (typeof GROUP_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export interface TaskFilters {
  q: string;
  status: string[];
  priority: string[];
  /** assignee user ids; the sentinel `UNASSIGNED` matches tasks nobody is assigned to */
  assignee: string[];
  sort: SortKey;
  dir: SortDir;
  group: GroupKey;
}

export const UNASSIGNED = 'none';

export const DEFAULT_FILTERS: TaskFilters = {
  q: '', status: [], priority: [], assignee: [], sort: 'manual', dir: 'asc', group: 'none',
};

export interface FilterableTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date?: string | null;
  created_at?: string | null;
  sort_index?: number | null;
  assignees?: { id: string; full_name?: string; email?: string }[] | null;
  subtasks?: FilterableTask[] | null;
}

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_RANK: Record<string, number> = { backlog: 0, todo: 1, 'in progress': 2, review: 3, 'on hold': 4, done: 5 };

const list = (v: string | null): string[] => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

/** Reads filters from a query string. Unknown keys/values fall back to defaults, so shared links never crash a page. */
export function parseFilters(params: URLSearchParams): TaskFilters {
  return {
    q: params.get('q') ?? '',
    status: list(params.get('status')),
    priority: list(params.get('priority')),
    assignee: list(params.get('assignee')),
    sort: pick(params.get('sort'), SORT_KEYS, DEFAULT_FILTERS.sort),
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    group: pick(params.get('group'), GROUP_KEYS, DEFAULT_FILTERS.group),
  };
}

/** Writes filters into a copy of `base`; only non-default values are emitted so URLs stay short. Other params are kept. */
export function serializeFilters(filters: TaskFilters, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const out = new URLSearchParams(base);
  for (const k of ['q', 'status', 'priority', 'assignee', 'sort', 'dir', 'group']) out.delete(k);
  const q = filters.q.trim();
  if (q) out.set('q', q);
  if (filters.status.length) out.set('status', filters.status.join(','));
  if (filters.priority.length) out.set('priority', filters.priority.join(','));
  if (filters.assignee.length) out.set('assignee', filters.assignee.join(','));
  if (filters.sort !== 'manual') out.set('sort', filters.sort);
  if (filters.dir === 'desc') out.set('dir', 'desc');
  if (filters.group !== 'none') out.set('group', filters.group);
  return out;
}

export function hasActiveFilters(f: TaskFilters): boolean {
  return Boolean(f.q.trim() || f.status.length || f.priority.length || f.assignee.length);
}

export function isDefaultView(f: TaskFilters): boolean {
  return !hasActiveFilters(f) && f.sort === 'manual' && f.dir === 'asc' && f.group === 'none';
}

const norm = (s: string) => s.trim().toLowerCase();

function matchesOwn(t: FilterableTask, f: TaskFilters): boolean {
  const q = norm(f.q);
  if (q && !norm(t.title).includes(q)) return false;
  if (f.status.length && !f.status.some((s) => norm(s) === norm(t.status))) return false;
  if (f.priority.length && !f.priority.some((p) => norm(p) === norm(t.priority))) return false;
  if (f.assignee.length) {
    const ids = (t.assignees ?? []).map((a) => a.id);
    const hit = f.assignee.some((a) => (a === UNASSIGNED ? ids.length === 0 : ids.includes(a)));
    if (!hit) return false;
  }
  return true;
}

/**
 * Filters a task tree. A task stays when it matches or any descendant matches; in the latter case it is kept as
 * context with only the matching branches of its subtasks, so a hit is never orphaned from its parent.
 */
export function filterTasks<T extends FilterableTask>(tasks: T[], f: TaskFilters): T[] {
  if (!hasActiveFilters(f)) return tasks;
  const walk = (list: T[]): T[] => {
    const out: T[] = [];
    for (const t of list) {
      const subs = t.subtasks?.length ? walk(t.subtasks as T[]) : [];
      if (matchesOwn(t, f)) out.push(subs.length === (t.subtasks?.length ?? 0) ? t : { ...t, subtasks: subs });
      else if (subs.length) out.push({ ...t, subtasks: subs });
    }
    return out;
  };
  return walk(tasks);
}

function compare(a: FilterableTask, b: FilterableTask, key: SortKey): number {
  switch (key) {
    case 'due': {
      // tasks without a due date sort last in ascending order
      const av = a.due_date ? Date.parse(a.due_date) : Infinity;
      const bv = b.due_date ? Date.parse(b.due_date) : Infinity;
      return av === bv ? 0 : av < bv ? -1 : 1;
    }
    case 'priority':
      return (PRIORITY_RANK[norm(a.priority)] ?? 9) - (PRIORITY_RANK[norm(b.priority)] ?? 9);
    case 'status':
      return (STATUS_RANK[norm(a.status)] ?? 9) - (STATUS_RANK[norm(b.status)] ?? 9);
    case 'title':
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
    case 'created':
      return (Date.parse(a.created_at ?? '') || 0) - (Date.parse(b.created_at ?? '') || 0);
    default:
      return (a.sort_index ?? 0) - (b.sort_index ?? 0);
  }
}

/** Stable sort of siblings (recursively). `manual` keeps the server order and ignores direction. */
export function sortTasks<T extends FilterableTask>(tasks: T[], f: Pick<TaskFilters, 'sort' | 'dir'>): T[] {
  if (f.sort === 'manual') return tasks;
  const sign = f.dir === 'desc' ? -1 : 1;
  const walk = (list: T[]): T[] =>
    list
      .map((t) => (t.subtasks?.length ? { ...t, subtasks: walk(t.subtasks as T[]) } : t))
      .map((t, i) => ({ t, i }))
      .sort((x, y) => sign * compare(x.t, y.t, f.sort) || x.i - y.i)
      .map(({ t }) => t);
  return walk(tasks);
}

export interface TaskGroup<T> {
  key: string;
  label: string;
  tasks: T[];
}

/** Buckets top-level tasks. A task with several assignees appears once per assignee. */
export function groupTasks<T extends FilterableTask>(tasks: T[], group: GroupKey): TaskGroup<T>[] {
  if (group === 'none') return [{ key: 'all', label: '', tasks }];
  const buckets = new Map<string, TaskGroup<T>>();
  const add = (key: string, label: string, t: T) => {
    const b = buckets.get(key) ?? { key, label, tasks: [] };
    b.tasks.push(t);
    buckets.set(key, b);
  };
  for (const t of tasks) {
    if (group === 'status') add(norm(t.status), t.status, t);
    else if (group === 'priority') add(norm(t.priority), t.priority, t);
    else if (t.assignees?.length) t.assignees.forEach((a) => add(a.id, a.full_name || a.email || a.id, t));
    else add(UNASSIGNED, 'Unassigned', t);
  }
  const rank = group === 'status' ? STATUS_RANK : group === 'priority' ? PRIORITY_RANK : null;
  return [...buckets.values()].sort((a, b) => {
    if (rank) return (rank[a.key] ?? 9) - (rank[b.key] ?? 9);
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return a.label.localeCompare(b.label);
  });
}

/** Distinct assignees found in a task tree, for the filter menu. */
export function collectAssignees(tasks: FilterableTask[]): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  const walk = (list: FilterableTask[]) => {
    for (const t of list) {
      t.assignees?.forEach((a) => seen.set(a.id, a.full_name || a.email || a.id));
      if (t.subtasks?.length) walk(t.subtasks);
    }
  };
  walk(tasks);
  return [...seen].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
}
