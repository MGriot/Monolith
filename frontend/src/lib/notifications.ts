export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string | null;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationFilters {
  unreadOnly: boolean;
  type: string; // '' = every type
  limit: number;
}

export const NOTIFICATION_TYPES: { value: string; label: string }[] = [
  { value: 'assignment', label: 'Assignments' },
  { value: 'unblocked', label: 'Unblocked tasks' },
  { value: 'completion', label: 'Completions' },
];

export const PAGE_SIZE = 50;

/** Query keys share the ['notifications'] prefix, so one invalidation refreshes the list, the bell and the badge. */
export const notificationKeys = {
  all: ['notifications'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  list: (f: NotificationFilters) => ['notifications', 'list', f.unreadOnly, f.type, f.limit] as const,
};

/** Request params for GET /notifications for the given filters. */
export function listParams(f: NotificationFilters): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = { limit: f.limit };
  if (f.unreadOnly) params.is_read = false;
  if (f.type) params.type = f.type;
  return params;
}

/** The server caps `limit` at 500; a full page means there may be more to load. */
export function mayHaveMore(received: number, limit: number): boolean {
  return received >= limit && limit < 500;
}

export function typeLabel(type: string | null | undefined): string {
  return NOTIFICATION_TYPES.find((t) => t.value === type)?.label ?? 'Update';
}
