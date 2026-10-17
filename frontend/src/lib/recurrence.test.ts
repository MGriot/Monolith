import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, buildRule, describeRule, parseRule } from './recurrence';

describe('recurrence rules', () => {
  it('builds canonical rules', () => {
    expect(buildRule(null)).toBeNull();
    expect(buildRule({ ...DEFAULT_MODEL, freq: 'DAILY' })).toBe('FREQ=DAILY');
    expect(buildRule({ ...DEFAULT_MODEL, freq: 'WEEKLY', interval: 2, byDay: ['WE', 'MO'] })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
    expect(buildRule({ ...DEFAULT_MODEL, freq: 'MONTHLY', monthlyMode: 'last' })).toBe('FREQ=MONTHLY;BYMONTHDAY=-1');
    expect(buildRule({ ...DEFAULT_MODEL, freq: 'MONTHLY', monthlyMode: 'nth', nth: '-1FR' })).toBe('FREQ=MONTHLY;BYDAY=-1FR');
    expect(buildRule({ ...DEFAULT_MODEL, freq: 'MONTHLY', monthDay: 15, until: '2027-12-31' })).toBe('FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20271231');
  });

  it('clamps the interval and day of month to what the API accepts', () => {
    expect(buildRule({ ...DEFAULT_MODEL, freq: 'DAILY', interval: 0 })).toBe('FREQ=DAILY');
    expect(buildRule({ ...DEFAULT_MODEL, freq: 'DAILY', interval: 9999 })).toBe('FREQ=DAILY;INTERVAL=365');
    expect(buildRule({ ...DEFAULT_MODEL, freq: 'MONTHLY', monthDay: 40 })).toBe('FREQ=MONTHLY;BYMONTHDAY=31');
  });

  it('round-trips through parse', () => {
    for (const rule of ['FREQ=DAILY', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE', 'FREQ=MONTHLY;BYMONTHDAY=-1', 'FREQ=MONTHLY;BYDAY=1MO', 'FREQ=YEARLY;UNTIL=20301231']) {
      expect(buildRule(parseRule(rule))).toBe(rule);
    }
  });

  it('parses nothing for empty or broken rules', () => {
    expect(parseRule(null)).toBeNull();
    expect(parseRule('')).toBeNull();
    expect(parseRule('FREQ=HOURLY')).toBeNull();
  });

  it('describes rules for humans', () => {
    expect(describeRule(null)).toBe('Does not repeat');
    expect(describeRule('FREQ=DAILY')).toBe('Every day');
    expect(describeRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')).toBe('Every 2 weeks on Mon, Wed');
    expect(describeRule('FREQ=MONTHLY;BYDAY=-1FR')).toBe('Every month on the last Friday');
    expect(describeRule('FREQ=MONTHLY;BYMONTHDAY=-1;UNTIL=20271231')).toBe('Every month on the last day until 2027-12-31');
  });
});
