// Grouping and filtering for the Metadata page (topics and work types share the shape).

export type TaxonomyScope = 'all' | 'global' | 'project' | 'task';

export interface ScopedItem {
  id: string;
  name: string;
  is_active: boolean;
  project_id?: string | null;
  task_id?: string | null;
}

export interface TaxonomyFilter {
  search: string;
  scope: TaxonomyScope;
  showInactive: boolean;
}

export interface Group<T> {
  key: string;
  label: string;
  note?: string;
  items: T[];
}

export function scopeOf(item: ScopedItem): Exclude<TaxonomyScope, 'all'> {
  if (item.task_id) return 'task';
  if (item.project_id) return 'project';
  return 'global';
}

export function filterTaxonomy<T extends ScopedItem>(items: readonly T[], filter: TaxonomyFilter): T[] {
  const q = filter.search.trim().toLowerCase();
  return items.filter((item) =>
    (filter.showInactive || item.is_active) &&
    (filter.scope === 'all' || scopeOf(item) === filter.scope) &&
    (!q || item.name.toLowerCase().includes(q))
  );
}

/** Global first, then one group per project (by project name), then task-specific items. Items sorted by name. */
export function groupTaxonomy<T extends ScopedItem>(items: readonly T[], projectNames: ReadonlyMap<string, string>): Group<T>[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const global: T[] = [];
  const task: T[] = [];
  const projects = new Map<string, T[]>();
  for (const item of items) {
    const scope = scopeOf(item);
    if (scope === 'global') global.push(item);
    else if (scope === 'task') task.push(item);
    else {
      const list = projects.get(item.project_id!) ?? [];
      list.push(item);
      projects.set(item.project_id!, list);
    }
  }
  const groups: Group<T>[] = [];
  if (global.length) groups.push({ key: 'global', label: 'Global', note: 'every project', items: global.sort(byName) });
  const projectGroups = [...projects.entries()]
    .map(([id, list]) => ({ key: `project:${id}`, label: projectNames.get(id) ?? 'Unknown project', note: 'project', items: list.sort(byName) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  groups.push(...projectGroups);
  if (task.length) groups.push({ key: 'task', label: 'Single tasks', note: 'task', items: task.sort(byName) });
  return groups;
}
