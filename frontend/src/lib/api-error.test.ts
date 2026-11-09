import { describe, expect, it } from 'vitest';
import { errorMessage } from './api-error';

const withDetail = (detail: unknown) => ({ response: { status: 400, data: { detail } } });

describe('errorMessage', () => {
  it('returns a string detail', () => {
    expect(errorMessage(withDetail('Project not found'), 'fallback')).toBe('Project not found');
  });

  it('returns the first message of a 422 validation array', () => {
    const detail = [
      { loc: ['body', 'title'], msg: 'Field required', type: 'missing' },
      { loc: ['body', 'due_date'], msg: 'Invalid date', type: 'date_parsing' },
    ];
    expect(errorMessage(withDetail(detail), 'fallback')).toBe('Field required');
  });

  it.each([
    ['an empty string detail', withDetail('')],
    ['an object detail', withDetail({ code: 'x' })],
    ['an empty array', withDetail([])],
    ['no response (network error)', new Error('Network Error')],
    ['undefined', undefined],
    ['null', null],
  ])('falls back for %s', (_label, err) => {
    expect(errorMessage(err, 'fallback')).toBe('fallback');
  });
});
