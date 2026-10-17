import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nextPreference, parsePreference, resolveTheme, THEME_STORAGE_KEY } from './theme';

describe('theme resolution', () => {
  it('follows the system only for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('falls back to system for anything unknown', () => {
    expect(parsePreference('dark')).toBe('dark');
    expect(parsePreference('light')).toBe('light');
    expect(parsePreference('system')).toBe('system');
    for (const bad of [null, undefined, '', 'DARK', 'blue', 3]) expect(parsePreference(bad)).toBe('system');
  });

  it('cycles system -> light -> dark -> system', () => {
    expect(nextPreference('system')).toBe('light');
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
  });
});

// index.html applies the theme before first paint with an inline script; run that exact script here.
describe('pre-paint script in index.html', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script id="theme-init">([\s\S]*?)<\/script>/);

  function run(stored: string | null | 'throw', systemDark: boolean) {
    const classes = new Set<string>();
    const doc = {
      documentElement: {
        classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
        style: {} as Record<string, string>,
      },
    };
    const storage = {
      getItem: (k: string) => {
        if (stored === 'throw') throw new Error('blocked');
        return k === THEME_STORAGE_KEY ? stored : null;
      },
    };
    const mm = () => ({ matches: systemDark });
    new Function('localStorage', 'matchMedia', 'document', match![1])(storage, mm, doc);
    return { dark: classes.has('dark'), scheme: doc.documentElement.style.colorScheme };
  }

  it('exists', () => {
    expect(match).not.toBeNull();
  });

  it('agrees with resolveTheme for every stored value and system setting', () => {
    for (const stored of ['light', 'dark', 'system', null, 'junk'] as const) {
      for (const sys of [true, false]) {
        const expected = resolveTheme(parsePreference(stored), sys);
        const got = run(stored, sys);
        expect(got.dark).toBe(expected === 'dark');
        expect(got.scheme).toBe(expected);
      }
    }
  });

  it('does not throw when storage is blocked', () => {
    expect(run('throw', true).dark).toBe(true);
    expect(run('throw', false).dark).toBe(false);
  });
});
