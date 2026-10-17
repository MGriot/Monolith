import { describe, expect, it } from 'vitest';
import { calculateSortIndex, flattenTasks, type SortableTask } from './kanban';

const t = (id: string, status: string, sort_index: number, extra: Partial<SortableTask> = {}): SortableTask => ({
  id, status, sort_index, created_at: '2025-01-01T00:00:00', ...extra,
});

describe('flattenTasks', () => {
  it('returns every task depth-first, subtasks included', () => {
    const tree: SortableTask[] = [
      t('a', 'Todo', 0, { subtasks: [t('a1', 'Todo', 0, { subtasks: [t('a1x', 'Done', 0)] }), t('a2', 'Todo', 10)] }),
      t('b', 'Todo', 10),
    ];
    expect(flattenTasks(tree).map((x) => x.id)).toEqual(['a', 'a1', 'a1x', 'a2', 'b']);
  });

  it('handles empty input and missing subtasks', () => {
    expect(flattenTasks([])).toEqual([]);
    expect(flattenTasks([{ ...t('a', 'Todo', 0), subtasks: null }]).map((x) => x.id)).toEqual(['a']);
  });
});

describe('calculateSortIndex', () => {
  const column = [t('x', 'Todo', 10), t('y', 'Todo', 20), t('z', 'Todo', 30), t('other', 'Done', 5)];

  it('empty destination column starts at 100', () => {
    expect(calculateSortIndex(column, 'Review', 0)).toBe(100);
  });

  it('dropping at the top goes before the first card', () => {
    expect(calculateSortIndex(column, 'Todo', 0)).toBe(0);
  });

  it('dropping at the end goes after the last card', () => {
    expect(calculateSortIndex(column, 'Todo', 3)).toBe(40);
    expect(calculateSortIndex(column, 'Todo', 99)).toBe(40);
  });

  it('dropping between two cards lands in the middle', () => {
    expect(calculateSortIndex(column, 'Todo', 1)).toBe(15);
    expect(calculateSortIndex(column, 'Todo', 2)).toBe(25);
  });

  it('ignores the card being moved (same-column reorder is not off by one)', () => {
    // move x (index 0) to the end of [x,y,z]: final position 2 -> after z
    expect(calculateSortIndex(column, 'Todo', 2, 'x')).toBe(40);
    // move z to the front
    expect(calculateSortIndex(column, 'Todo', 0, 'z')).toBe(0);
    // move x between y and z: column without x is [y,z], index 1 -> between them
    expect(calculateSortIndex(column, 'Todo', 1, 'x')).toBe(25);
  });

  it('status match is case-insensitive', () => {
    expect(calculateSortIndex(column, 'todo', 3)).toBe(40);
  });

  it('adjacent indexes fall back to prev+1 instead of repeating a value', () => {
    const tight = [t('a', 'Todo', 5), t('b', 'Todo', 6)];
    expect(calculateSortIndex(tight, 'Todo', 1)).toBe(6);
    const same = [t('a', 'Todo', 5), t('b', 'Todo', 5)];
    expect(calculateSortIndex(same, 'Todo', 1)).toBe(6);
  });

  it('uses created_at to break sort_index ties', () => {
    const tied = [
      t('late', 'Todo', 10, { created_at: '2025-02-01T00:00:00' }),
      t('early', 'Todo', 10, { created_at: '2025-01-01T00:00:00' }),
      t('next', 'Todo', 50),
    ];
    // order is early, late, next -> index 1 sits between early(10) and late(10)
    expect(calculateSortIndex(tied, 'Todo', 1)).toBe(11);
  });
});
