// Theme preference (system / light / dark). The same resolution rule is inlined in index.html so the class is set
// before first paint; theme.test.ts runs that inline script against these helpers to keep both in step.
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'monolith-theme';
export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];
export const THEME_LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function parsePreference(raw: unknown): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/** The next preference when cycling with a single button: system -> light -> dark -> system. */
export function nextPreference(pref: ThemePreference): ThemePreference {
  return THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(pref) + 1) % THEME_PREFERENCES.length];
}

export function readStoredPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function storePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* private mode / blocked storage: the choice just lasts for this page view */
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}
