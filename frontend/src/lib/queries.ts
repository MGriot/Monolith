import { queryOptions, useQuery } from '@tanstack/react-query';
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

/** GET /auth/config: instance-wide settings any screen may need. */
export interface AppConfig {
  allow_signup: boolean;
  email_enabled: boolean;
  min_password_length: number;
  /** ISO 4217 code for budgets, real cost and currency fields that do not name their own. */
  currency: string;
}

export const appConfigQuery = queryOptions({
  queryKey: ['app-config'],
  queryFn: async () => (await api.get<AppConfig>('/auth/config')).data,
  staleTime: Infinity,
});

/** The instance currency ("EUR" until the config has loaded). */
export function useCurrency(): string {
  return useQuery(appConfigQuery).data?.currency || 'EUR';
}
