import { afterEach, describe, expect, it } from 'vitest';
import { positionPx, stepZoom, widthPx } from './timeline';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('positionPx / widthPx', () => {
  const start = new Date(2025, 2, 1); // local midnight, 1 March

  it('counts calendar days plus the time of day', () => {
    expect(positionPx('2025-03-01T00:00:00', start, 10)).toBe(0);
    expect(positionPx('2025-03-03T00:00:00', start, 10)).toBe(20);
    expect(positionPx('2025-03-03T12:00:00', start, 10)).toBe(25);
    expect(positionPx(new Date(2025, 1, 28), start, 10)).toBe(-10);
  });

  it('does not drift across a DST change', () => {
    process.env.TZ = 'America/New_York'; // clocks go forward on 9 March 2025
    const windowStart = new Date(2025, 2, 1);
    expect(positionPx('2025-03-15T00:00:00', windowStart, 10)).toBe(140);
  });

  it('includes both the start and the end day', () => {
    expect(widthPx('2025-03-01T00:00:00', '2025-03-01T00:00:00', 10)).toBe(10);
    expect(widthPx('2025-03-01T00:00:00', '2025-03-05T00:00:00', 10)).toBe(50);
    expect(widthPx('2025-03-01T12:00:00', '2025-03-02T00:00:00', 10)).toBe(15);
  });
});

describe('stepZoom', () => {
  const levels = ['day', 'week', 'month'] as const;
  it('moves one level and stops at the ends', () => {
    expect(stepZoom(levels, 'week', 'in')).toBe('day');
    expect(stepZoom(levels, 'week', 'out')).toBe('month');
    expect(stepZoom(levels, 'day', 'in')).toBe('day');
    expect(stepZoom(levels, 'month', 'out')).toBe('month');
  });
});
