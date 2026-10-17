export type ProjectRole = 'viewer' | 'editor' | 'admin';

export const PROJECT_ROLES: ProjectRole[] = ['viewer', 'editor', 'admin'];

export const ROLE_LABELS: Record<ProjectRole, string> = { viewer: 'Viewer', editor: 'Editor', admin: 'Admin' };

export const ROLE_HINTS: Record<ProjectRole, string> = {
  viewer: 'Can read everything, cannot change anything.',
  editor: 'Can work on tasks, comments, ideas, files and whiteboards.',
  admin: 'Editor rights plus project settings, members, custom fields and archiving.',
};

const RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, admin: 3 };

export function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === 'string' && value in RANK;
}

/** True when `role` is at least `min`. Unknown / missing roles have no rights (the API is the real gate). */
export function atLeast(role: string | null | undefined, min: ProjectRole): boolean {
  return isProjectRole(role) && RANK[role] >= RANK[min];
}

export const canEdit = (role: string | null | undefined) => atLeast(role, 'editor');
export const canAdmin = (role: string | null | undefined) => atLeast(role, 'admin');
