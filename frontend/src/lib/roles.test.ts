import { describe, expect, it } from 'vitest';
import { atLeast, canAdmin, canEdit, isProjectRole, PROJECT_ROLES, ROLE_HINTS, ROLE_LABELS } from './roles';

describe('project roles', () => {
  it('ranks viewer < editor < admin', () => {
    expect(atLeast('viewer', 'viewer')).toBe(true);
    expect(atLeast('viewer', 'editor')).toBe(false);
    expect(atLeast('editor', 'editor')).toBe(true);
    expect(atLeast('editor', 'admin')).toBe(false);
    expect(atLeast('admin', 'viewer')).toBe(true);
    expect(atLeast('admin', 'admin')).toBe(true);
  });

  it('helpers map to the right level', () => {
    expect([canEdit('viewer'), canEdit('editor'), canEdit('admin')]).toEqual([false, true, true]);
    expect([canAdmin('viewer'), canAdmin('editor'), canAdmin('admin')]).toEqual([false, false, true]);
  });

  it('unknown or missing roles grant nothing', () => {
    for (const bad of [undefined, null, '', 'owner', 'ADMIN', 'superuser']) {
      expect(canEdit(bad)).toBe(false);
      expect(canAdmin(bad)).toBe(false);
      expect(atLeast(bad, 'viewer')).toBe(false);
    }
  });

  it('type guard and labels cover every role', () => {
    expect(isProjectRole('editor')).toBe(true);
    expect(isProjectRole('god')).toBe(false);
    expect(isProjectRole(3)).toBe(false);
    for (const r of PROJECT_ROLES) {
      expect(ROLE_LABELS[r]).toBeTruthy();
      expect(ROLE_HINTS[r]).toBeTruthy();
    }
  });
});
