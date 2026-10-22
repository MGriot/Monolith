import { describe, expect, it } from 'vitest';
import { findTask, flattenTasks, subtreeIds, walkTasks } from './tasks';

interface Node { id: string; n?: number; subtasks?: Node[] | null }

const tree: Node[] = [
  { id: 'a', n: 2, subtasks: [{ id: 'a1', n: 1, subtasks: [{ id: 'a1x' }] }, { id: 'a2', n: 0 }] },
  { id: 'b', n: 1 },
];

describe('flattenTasks', () => {
  it('returns every task depth-first, subtasks included', () => {
    expect(flattenTasks(tree).map((x) => x.id)).toEqual(['a', 'a1', 'a1x', 'a2', 'b']);
  });

  it('handles empty input and missing subtasks', () => {
    expect(flattenTasks([])).toEqual([]);
    expect(flattenTasks([{ id: 'a', subtasks: null }]).map((x) => x.id)).toEqual(['a']);
  });
});

describe('walkTasks', () => {
  it('passes the parent and the depth', () => {
    const seen: string[] = [];
    walkTasks(tree, (t, parent, level) => seen.push(`${t.id}<${parent?.id ?? '-'}@${level}`));
    expect(seen).toEqual(['a<-@0', 'a1<a@1', 'a1x<a1@2', 'a2<a@1', 'b<-@0']);
  });

  it('applies the sibling order at every level', () => {
    const seen: string[] = [];
    walkTasks(tree, (t) => seen.push(t.id), { order: (list) => [...list].sort((x, y) => (x.n ?? 0) - (y.n ?? 0)) });
    expect(seen).toEqual(['b', 'a', 'a2', 'a1', 'a1x']);
  });

  it('skips the subtasks of tasks where descend is false', () => {
    const seen: string[] = [];
    walkTasks(tree, (t) => seen.push(t.id), { descend: (t) => t.id !== 'a1' });
    expect(seen).toEqual(['a', 'a1', 'a2', 'b']);
  });
});

describe('findTask / subtreeIds', () => {
  it('finds tasks at any depth', () => {
    expect(findTask(tree, 'a1x')?.id).toBe('a1x');
    expect(findTask(tree, 'b')?.id).toBe('b');
    expect(findTask(tree, 'zzz')).toBeNull();
  });

  it('collects a task and its descendants', () => {
    expect([...subtreeIds(tree, 'a1')]).toEqual(['a1', 'a1x']);
    expect([...subtreeIds(tree, 'b')]).toEqual(['b']);
    expect(subtreeIds(tree, 'zzz').size).toBe(0);
  });
});
