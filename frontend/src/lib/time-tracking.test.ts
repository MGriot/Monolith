import { describe, expect, it } from 'vitest';
import {
  describeVariance,
  elapsedSeconds,
  estimateStatus,
  formatClock,
  formatDuration,
  manualEntryRange,
  parseDurationInput,
  parseServerDate,
} from './time-tracking';

describe('parseServerDate', () => {
  it('treats timestamps without an offset as UTC', () => {
    expect(parseServerDate('2026-01-01T09:00:00').toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });
  it('keeps explicit offsets', () => {
    expect(parseServerDate('2026-01-01T09:00:00Z').toISOString()).toBe('2026-01-01T09:00:00.000Z');
    expect(parseServerDate('2026-01-01T10:00:00+01:00').toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });
});

describe('elapsedSeconds / formatClock', () => {
  it('counts from the UTC start', () => {
    expect(elapsedSeconds('2026-01-01T09:00:00', new Date('2026-01-01T10:01:05Z'))).toBe(3665);
  });
  it('never goes negative', () => {
    expect(elapsedSeconds('2026-01-01T09:00:00', new Date('2026-01-01T08:00:00Z'))).toBe(0);
  });
  it('formats h:mm:ss', () => {
    expect(formatClock(3665)).toBe('1:01:05');
    expect(formatClock(5)).toBe('0:00:05');
    expect(formatClock(-3)).toBe('0:00:00');
  });
});

describe('formatDuration', () => {
  it('rounds to minutes', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(29)).toBe('0m');
    expect(formatDuration(31)).toBe('1m');
    expect(formatDuration(45 * 60)).toBe('45m');
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2h 05m');
    expect(formatDuration(10 * 3600)).toBe('10h 00m');
  });
});

describe('parseDurationInput', () => {
  it.each([
    ['1h 30m', 5400],
    ['1h30m', 5400],
    ['90m', 5400],
    ['90 min', 5400],
    ['1.5h', 5400],
    ['2 hours', 7200],
    ['1:30', 5400],
    ['45', 2700],
    ['  2H  ', 7200],
  ])('parses %s', (input, seconds) => {
    expect(parseDurationInput(input)).toBe(seconds);
  });

  it.each(['', '   ', 'abc', '0', '0h', '-5', '1:75', 'h', '1x'])('rejects %j', (input) => {
    expect(parseDurationInput(input)).toBeNull();
  });
});

describe('manualEntryRange', () => {
  it('ends at the given moment and starts `seconds` before it', () => {
    const r = manualEntryRange(new Date('2026-01-01T10:00:00Z'), 5400);
    expect(r).toEqual({ started_at: '2026-01-01T08:30:00.000Z', ended_at: '2026-01-01T10:00:00.000Z' });
  });
});

describe('estimate display', () => {
  it('classifies progress against the estimate', () => {
    expect(estimateStatus({ estimate_hours: 0, percent_of_estimate: null })).toBe('none');
    expect(estimateStatus({ estimate_hours: 8, percent_of_estimate: 40 })).toBe('ok');
    expect(estimateStatus({ estimate_hours: 8, percent_of_estimate: 80 })).toBe('warn');
    expect(estimateStatus({ estimate_hours: 8, percent_of_estimate: 100 })).toBe('warn');
    expect(estimateStatus({ estimate_hours: 8, percent_of_estimate: 100.1 })).toBe('over');
  });
  it('describes the variance', () => {
    expect(describeVariance({ estimate_hours: 0, variance_hours: 3 })).toBe('');
    expect(describeVariance({ estimate_hours: 8, variance_hours: 2.46 })).toBe('2.5h over');
    expect(describeVariance({ estimate_hours: 8, variance_hours: -1 })).toBe('1h left');
    expect(describeVariance({ estimate_hours: 8, variance_hours: 0 })).toBe('on estimate');
  });
});
