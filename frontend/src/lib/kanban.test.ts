import { describe, expect, it } from 'vitest';
import { calculateSortIndex, dropIndex, findColumn, moveAcrossColumns, type Columns, type SortableTask } from './kanban';

const t = (id: string, status: string, sort_index: number, extra: Partial<SortableTask> = {}): SortableTask => ({
  id, status, sort_index, created_at: '2025-01-01T00:00:00', ...extra,
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

describe('board drag helpers', () => {
  const board = (): Columns => ({ Todo: ['a', 'b', 'c'], Done: ['x', 'y'], Review: [] });

  it('findColumn resolves cards and column ids', () => {
    expect(findColumn(board(), 'b')).toBe('Todo');
    expect(findColumn(board(), 'Review')).toBe('Review');
    expect(findColumn(board(), 'nope')).toBeUndefined();
  });

  it('dragging over a card in another column inserts before it', () => {
    expect(moveAcrossColumns(board(), 'a', 'x')).toEqual({ Todo: ['b', 'c'], Done: ['a', 'x', 'y'], Review: [] });
  });

  it('dragging over the last card of another column inserts after it (isBelowLastItem)', () => {
    expect(moveAcrossColumns(board(), 'a', 'y')).toEqual({ Todo: ['b', 'c'], Done: ['x', 'y', 'a'], Review: [] });
  });

  it('dragging over a column appends to it', () => {
    expect(moveAcrossColumns(board(), 'a', 'Done')).toEqual({ Todo: ['b', 'c'], Done: ['x', 'y', 'a'], Review: [] });
    expect(moveAcrossColumns(board(), 'a', 'Review')).toEqual({ Todo: ['b', 'c'], Done: ['x', 'y'], Review: ['a'] });
  });

  it('is a no-op within the same column, for columns being dragged, and for unknown ids', () => {
    expect(moveAcrossColumns(board(), 'a', 'c')).toBeNull();
    expect(moveAcrossColumns(board(), 'Todo', 'x')).toBeNull();
    expect(moveAcrossColumns(board(), 'a', 'nope')).toBeNull();
  });

  it('dropIndex is the hovered card index, or the end when dropped on the column', () => {
    expect(dropIndex(board(), 'Todo', 'b')).toBe(1);
    expect(dropIndex(board(), 'Done', 'Done')).toBe(2);
    expect(dropIndex(board(), 'Review', 'Review')).toBe(0);
  });
});
