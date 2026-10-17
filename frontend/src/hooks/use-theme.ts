import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  applyResolvedTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

// A tiny external store so every component (toggle, whiteboard, ...) sees the same preference.
let preference: ThemePreference = readStoredPreference();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function currentResolved(): ResolvedTheme {
  return resolveTheme(preference, systemPrefersDark());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onSystem = () => {
    applyResolvedTheme(currentResolved());
    emit();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    preference = readStoredPreference();
    onSystem();
  };
  media?.addEventListener?.('change', onSystem);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener?.('change', onSystem);
    window.removeEventListener('storage', onStorage);
  };
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  storePreference(next);
  applyResolvedTheme(currentResolved());
  emit();
}

export function useTheme() {
  const pref = useSyncExternalStore(subscribe, () => preference);
  const systemDark = useSyncExternalStore(
    subscribe,
    () => systemPrefersDark(),
  );
  const resolved = resolveTheme(pref, systemDark);
  // keep <html> in step even if the inline script in index.html was blocked
  useEffect(() => applyResolvedTheme(resolved), [resolved]);
  const set = useCallback((p: ThemePreference) => setThemePreference(p), []);
  return { preference: pref, resolved, setPreference: set };
}
