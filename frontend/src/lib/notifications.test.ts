import { describe, expect, it } from 'vitest';
import { listParams, mayHaveMore, typeLabel } from './notifications';

describe('notification list params', () => {
  it('sends only the filters that are set', () => {
    expect(listParams({ unreadOnly: false, type: '', limit: 50 })).toEqual({ limit: 50 });
    expect(listParams({ unreadOnly: true, type: 'assignment', limit: 100 })).toEqual({
      limit: 100,
      is_read: false,
      type: 'assignment',
    });
  });

  it('knows when another page may exist (server caps at 500)', () => {
    expect(mayHaveMore(50, 50)).toBe(true);
    expect(mayHaveMore(12, 50)).toBe(false);
    expect(mayHaveMore(500, 500)).toBe(false);
  });

  it('labels unknown types generically', () => {
    expect(typeLabel('assignment')).toBe('Assignments');
    expect(typeLabel('weird')).toBe('Update');
    expect(typeLabel(null)).toBe('Update');
  });
});
