import { queryOptions } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Project, User } from '@/types';

// Shared queries for endpoints read from many screens: one cache entry each, so an invalidation reaches every reader.

/** GET /projects/ (active projects visible to the user). */
export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: async () => (await api.get<Project[]>('/projects/')).data,
});

/** A row of GET /users/ (the API's User schema). */
export type UserRecord = User & { is_active: boolean; is_superuser: boolean };

/** GET /users/ with the API's maximum page size, so pickers list everyone. */
export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: async () => (await api.get<UserRecord[]>('/users/', { params: { limit: 500 } })).data,
});
