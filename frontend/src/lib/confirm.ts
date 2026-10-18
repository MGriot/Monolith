// Styled replacement for window.confirm: `if (await confirmDialog({...})) ...`.
// A tiny external store so any module can ask, and <ConfirmHost /> (mounted once in App) renders the dialog.

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" paints the confirm button red (delete, discard, ...) */
  tone?: 'default' | 'danger';
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

let current: ConfirmRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeConfirm(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConfirmRequest() {
  return current;
}

/** Resolves true when the user confirms, false when they cancel or close the dialog. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  // A second request while one is open cancels the first, like a native dialog would never allow two.
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...options, id: nextId++, resolve };
    emit();
  });
}

export function settleConfirm(ok: boolean) {
  if (!current) return;
  const request = current;
  current = null;
  request.resolve(ok);
  emit();
}
