import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { listParams, notificationKeys, type AppNotification, type NotificationFilters } from '@/lib/notifications';

/** Unread badge: a COUNT on the server, not the whole list. */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: async () => (await api.get<{ count: number }>('/notifications/unread-count')).data.count,
    staleTime: 30_000,
  });
}

export function useNotificationList(filters: NotificationFilters, enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: async () => (await api.get<AppNotification[]>('/notifications/', { params: listParams(filters) })).data,
    enabled,
  });
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  const setRead = useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) => api.put(`/notifications/${id}`, { is_read: isRead }),
    onSuccess: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/mark-all-as-read'),
    onSuccess: refresh,
  });
  return { setRead, markAllRead };
}
