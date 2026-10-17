/** Tiny window-event bus so the global palette can poke the current page (e.g. toggle its view) without prop drilling. */
export const TOGGLE_VIEW_EVENT = 'monolith:toggle-view';

export const emitAppEvent = (name: string) => window.dispatchEvent(new CustomEvent(name));

export function onAppEvent(name: string, handler: () => void): () => void {
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}
