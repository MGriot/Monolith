import { describe, expect, it } from 'vitest';
import { buildPaletteItems, filterCommands, hitsToCommands, moveIndex, scoreMatch, type PaletteCommand, type SearchHit } from './command-palette';

const nav = (id: string, title: string, keywords?: string[]): PaletteCommand => ({
  id, title, section: 'Navigate', keywords, run: { type: 'navigate', to: `/${id}` },
});
const act = (id: string, title: string): PaletteCommand => ({ id, title, section: 'Actions', run: { type: 'create-task' } });

describe('scoreMatch', () => {
  it('ranks exact > prefix > word start > substring > subsequence > none', () => {
    const s = (q: string, t: string) => scoreMatch(q, t);
    expect(s('tasks', 'Tasks')).toBeGreaterThan(s('ta', 'Tasks')!);
    expect(s('ta', 'Tasks')).toBeGreaterThan(s('ta', 'My Tasks')!);
    expect(s('ta', 'My Tasks')).toBeGreaterThan(s('ask', 'Tasks')!);
    expect(s('ask', 'Tasks')).toBeGreaterThan(s('tks', 'Tasks')!);
    expect(s('zz', 'Tasks')).toBeNull();
  });
  it('empty query matches everything', () => {
    expect(scoreMatch('  ', 'x')).toBe(0);
  });
});

describe('filterCommands', () => {
  const cmds = [nav('projects', 'Projects'), nav('tasks', 'Tasks', ['todo']), act('new-task', 'New task')];

  it('returns all in order for an empty query', () => {
    expect(filterCommands(cmds, '')).toBe(cmds);
  });
  it('matches keywords but ranks title matches higher', () => {
    expect(filterCommands(cmds, 'todo').map((c) => c.id)).toEqual(['tasks']);
    expect(filterCommands(cmds, 'task').map((c) => c.id)).toEqual(['tasks', 'new-task']);
  });
});

describe('buildPaletteItems', () => {
  const hits: SearchHit[] = [
    { type: 'project', id: 'p1', title: 'Apollo', link: '/projects/p1' },
    { type: 'task', id: 't1', title: 'Fix it', description: 'x', link: '/projects/p1?task=t1' },
  ];
  it('orders sections Actions, Navigate, Results and keeps server hits regardless of local filter', () => {
    const items = buildPaletteItems([nav('tasks', 'Tasks'), act('new', 'New task')], hits, 'ta');
    expect(items.map((i) => i.section)).toEqual(['Actions', 'Navigate', 'Results', 'Results']);
    expect(items.at(-1)?.run).toEqual({ type: 'navigate', to: '/projects/p1?task=t1' });
  });
  it('hit commands carry their type as hint', () => {
    expect(hitsToCommands(hits).map((c) => c.hint)).toEqual(['project', 'task']);
  });
});

describe('moveIndex', () => {
  it('wraps and handles empty lists', () => {
    expect(moveIndex(0, -1, 3)).toBe(2);
    expect(moveIndex(2, 1, 3)).toBe(0);
    expect(moveIndex(-1, 1, 3)).toBe(0);
    expect(moveIndex(0, 1, 0)).toBe(-1);
  });
});
