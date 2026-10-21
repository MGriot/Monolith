import { describe, expect, it } from 'vitest';
import { changedElements, rememberVersions, roomUrl, type SceneElement } from './whiteboard-collab';

const el = (id: string, version: number): SceneElement => ({ id, version, versionNonce: 1 });

describe('changedElements', () => {
  it('sends new and changed elements once', () => {
    const known = new Map<string, number>();
    expect(changedElements([el('a', 1), el('b', 1)], known).map((e) => e.id)).toEqual(['a', 'b']);
    expect(changedElements([el('a', 1), el('b', 1)], known)).toEqual([]);
    expect(changedElements([el('a', 2), el('b', 1)], known).map((e) => e.id)).toEqual(['a']);
  });

  it('does not echo what others sent', () => {
    const known = new Map<string, number>();
    rememberVersions([el('a', 3)], known);
    expect(changedElements([el('a', 3)], known)).toEqual([]);
    expect(changedElements([el('a', 4)], known)).toHaveLength(1);
  });

  it('keeps the newest version it has seen', () => {
    const known = new Map<string, number>([['a', 5]]);
    rememberVersions([el('a', 2)], known);
    expect(known.get('a')).toBe(5);
  });
});

describe('roomUrl', () => {
  it('uses wss behind https and the same host', () => {
    expect(roomUrl('wb1', { protocol: 'https:', host: 'pm.example.com' } as Location)).toBe('wss://pm.example.com/api/v1/whiteboards/wb1/ws');
    expect(roomUrl('wb1', { protocol: 'http:', host: 'localhost:8080' } as Location)).toBe('ws://localhost:8080/api/v1/whiteboards/wb1/ws');
  });
});
