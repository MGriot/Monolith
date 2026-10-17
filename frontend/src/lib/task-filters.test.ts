import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS, collectAssignees, filterTasks, groupTasks, hasActiveFilters, parseFilters, serializeFilters,
  sortTasks, type FilterableTask, type TaskFilters,
} from './task-filters';

const u = (id: string, full_name = id) => ({ id, full_name });
const t = (id: string, extra: Partial<FilterableTask> = {}): FilterableTask => ({
  id, title: `Task ${id}`, status: 'Todo', priority: 'Medium', ...extra,
});
const f = (extra: Partial<TaskFilters>): TaskFilters => ({ ...DEFAULT_FILTERS, ...extra });
const ids = (list: FilterableTask[]) => list.map((x) => x.id);

describe('URL round trip', () => {
  it('serializes only non-default values and parses them back', () => {
    const filters = f({ q: 'a&b #1', status: ['In Progress', 'Todo'], priority: ['High'], assignee: ['u1', 'none'], sort: 'due', dir: 'desc', group: 'status' });
    const qs = serializeFilters(filters).toString();
    expect(qs).not.toContain('a&b'); // encoded, not raw
    expect(parseFilters(new URLSearchParams(qs))).toEqual(filters);
  });

  it('emits nothing for the default view and keeps unrelated params', () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe('');
    const out = serializeFilters(f({ sort: 'title' }), new URLSearchParams('tab=kanban&status=Done'));
    expect(out.get('tab')).toBe('kanban');
    expect(out.has('status')).toBe(false);
    expect(out.get('sort')).toBe('title');
  });

  it('falls back to defaults for junk values', () => {
    const p = parseFilters(new URLSearchParams('sort=bogus&group=x&dir=up&status=,,Todo,'));
    expect(p.sort).toBe('manual');
    expect(p.group).toBe('none');
    expect(p.dir).toBe('asc');
    expect(p.status).toEqual(['Todo']);
  });
});

describe('filterTasks', () => {
  const tasks = [
    t('1', { title: 'Write docs', status: 'Done', priority: 'Low', assignees: [u('a')] }),
    t('2', { title: 'Fix login', status: 'In Progress', priority: 'High', assignees: [u('b')] }),
    t('3', { title: 'Parent', subtasks: [t('3a', { title: 'Fix cache', status: 'Done' }), t('3b', { title: 'Other' })] }),
  ];

  it('returns the input untouched without filters', () => {
    expect(filterTasks(tasks, DEFAULT_FILTERS)).toBe(tasks);
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
  });

  it('matches text case-insensitively and status/priority regardless of case', () => {
    expect(ids(filterTasks(tasks, f({ q: 'LOGIN' })))).toEqual(['2']);
    expect(ids(filterTasks(tasks, f({ status: ['in progress'] })))).toEqual(['2']);
    expect(ids(filterTasks(tasks, f({ priority: ['low', 'high'] })))).toEqual(['1', '2']);
  });

  it('filters by assignee including the unassigned sentinel', () => {
    expect(ids(filterTasks(tasks, f({ assignee: ['a'] })))).toEqual(['1']);
    expect(ids(filterTasks(tasks, f({ assignee: ['none'] })))).toEqual(['3']);
  });

  it('keeps a parent as context and prunes non-matching subtasks', () => {
    const out = filterTasks(tasks, f({ q: 'cache' }));
    expect(ids(out)).toEqual(['3']);
    expect(ids(out[0].subtasks ?? [])).toEqual(['3a']);
    expect(tasks[2].subtasks).toHaveLength(2); // input not mutated
  });
});

describe('sortTasks', () => {
  const tasks = [
    t('a', { title: 'b', due_date: '2025-03-01', priority: 'Low', sort_index: 3 }),
    t('b', { title: 'a', due_date: null, priority: 'Critical', sort_index: 1 }),
    t('c', { title: 'c', due_date: '2025-01-01', priority: 'High', sort_index: 2 }),
  ];

  it('manual keeps the given order', () => {
    expect(sortTasks(tasks, { sort: 'manual', dir: 'desc' })).toBe(tasks);
  });

  it('sorts by due date with missing dates last, and reverses', () => {
    expect(ids(sortTasks(tasks, { sort: 'due', dir: 'asc' }))).toEqual(['c', 'a', 'b']);
    expect(ids(sortTasks(tasks, { sort: 'due', dir: 'desc' }))).toEqual(['b', 'a', 'c']);
  });

  it('sorts by priority rank and title', () => {
    expect(ids(sortTasks(tasks, { sort: 'priority', dir: 'asc' }))).toEqual(['b', 'c', 'a']);
    expect(ids(sortTasks(tasks, { sort: 'title', dir: 'asc' }))).toEqual(['b', 'a', 'c']);
  });

  it('is stable for ties and sorts subtasks too', () => {
    const tie = [t('x'), t('y'), t('z', { subtasks: [t('s2', { title: 'b' }), t('s1', { title: 'a' })] })];
    const out = sortTasks(tie, { sort: 'status', dir: 'asc' });
    expect(ids(out)).toEqual(['x', 'y', 'z']);
    expect(ids(out[2].subtasks ?? [])).toEqual(['s2', 's1']);
    expect(ids(sortTasks(tie, { sort: 'title', dir: 'asc' })[2].subtasks ?? [])).toEqual(['s1', 's2']);
  });
});

describe('groupTasks', () => {
  it('returns one unlabeled group for none', () => {
    const tasks = [t('1')];
    expect(groupTasks(tasks, 'none')).toEqual([{ key: 'all', label: '', tasks }]);
  });

  it('groups by status in workflow order', () => {
    const g = groupTasks([t('1', { status: 'Done' }), t('2', { status: 'todo' }), t('3', { status: 'Todo' })], 'status');
    expect(g.map((x) => x.label)).toEqual(['todo', 'Done']);
    expect(ids(g[0].tasks)).toEqual(['2', '3']);
  });

  it('groups by assignee, repeating multi-assignee tasks and putting unassigned last', () => {
    const g = groupTasks([
      t('1', { assignees: [u('b', 'Bea'), u('a', 'Al')] }),
      t('2'),
      t('3', { assignees: [u('a', 'Al')] }),
    ], 'assignee');
    expect(g.map((x) => x.label)).toEqual(['Al', 'Bea', 'Unassigned']);
    expect(ids(g[0].tasks)).toEqual(['1', '3']);
  });
});

describe('collectAssignees', () => {
  it('dedupes across subtasks and sorts by name', () => {
    const out = collectAssignees([t('1', { assignees: [u('b', 'Bea')], subtasks: [t('2', { assignees: [u('a', 'Al'), u('b', 'Bea')] })] })]);
    expect(out).toEqual([{ id: 'a', label: 'Al' }, { id: 'b', label: 'Bea' }]);
  });
});
