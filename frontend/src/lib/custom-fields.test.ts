import { describe, expect, it } from 'vitest';
import {
  cleanDraft,
  coerceFieldInput,
  describeDefinition,
  fieldSuffix,
  formatFieldValue,
  formatMoney,
  parseOptionsInput,
  rangeLabel,
  sanitizeCustomValues,
  sortDefinitions,
  validateCustomValues,
  validateDefinition,
  validateFieldValue,
  type CustomFieldDef,
} from './custom-fields';

const UID = '123e4567-e89b-42d3-a456-426614174000';
const def = (id: string, field_type: CustomFieldDef['field_type'], extra: Partial<CustomFieldDef> = {}): CustomFieldDef => ({
  id, project_id: 'p', name: id, field_type, options: [], position: 0, ...extra,
});
const DEFS = [
  def('t', 'text'),
  def('n', 'number'),
  def('s', 'select', { options: ['alpha', 'beta'] }),
  def('d', 'date'),
  def('u', 'user'),
];

describe('parseOptionsInput', () => {
  it('trims, drops blanks and duplicates, keeps order', () => {
    expect(parseOptionsInput(' a, b ,a,,\n c ')).toEqual(['a', 'b', 'c']);
    expect(parseOptionsInput('')).toEqual([]);
  });
});

describe('validateDefinition', () => {
  it('requires a name', () => {
    expect(validateDefinition({ name: '  ', field_type: 'text' })).toMatch(/name/);
  });
  it('rejects duplicate names case-insensitively, but not the field itself', () => {
    const existing = [{ id: '1', name: 'Client' }];
    expect(validateDefinition({ name: 'client', field_type: 'text' }, existing)).toMatch(/already/);
    expect(validateDefinition({ name: 'client', field_type: 'text' }, existing, '1')).toBeNull();
  });
  it('requires options for select fields only', () => {
    expect(validateDefinition({ name: 'S', field_type: 'select', options: [] })).toMatch(/option/);
    expect(validateDefinition({ name: 'S', field_type: 'select', options: ['a'] })).toBeNull();
    expect(validateDefinition({ name: 'T', field_type: 'text' })).toBeNull();
  });
});

describe('validateFieldValue', () => {
  it('treats empty as valid (clears)', () => {
    for (const d of DEFS) expect(validateFieldValue(d, '')).toBeNull();
  });
  it('checks each type', () => {
    expect(validateFieldValue(DEFS[0], 'x'.repeat(5001))).not.toBeNull();
    expect(validateFieldValue(DEFS[1], '12,5')).toBeNull();
    expect(validateFieldValue(DEFS[1], 'twelve')).not.toBeNull();
    expect(validateFieldValue(DEFS[1], Number.NaN)).not.toBeNull();
    expect(validateFieldValue(DEFS[2], 'beta')).toBeNull();
    expect(validateFieldValue(DEFS[2], 'gamma')).not.toBeNull();
    expect(validateFieldValue(DEFS[3], '2026-02-30x')).not.toBeNull();
    expect(validateFieldValue(DEFS[3], '2026-03-04')).toBeNull();
    expect(validateFieldValue(DEFS[4], UID)).toBeNull();
    expect(validateFieldValue(DEFS[4], 'someone')).not.toBeNull();
  });
});

describe('coerceFieldInput', () => {
  it('parses numbers (comma decimals too) and clears empties', () => {
    expect(coerceFieldInput(DEFS[1], '12,5')).toBe(12.5);
    expect(coerceFieldInput(DEFS[1], '')).toBeUndefined();
    expect(coerceFieldInput(DEFS[1], 'abc')).toBeUndefined();
    expect(coerceFieldInput(DEFS[0], 'hello')).toBe('hello');
  });
});

describe('sanitizeCustomValues', () => {
  it('drops unknown ids, empties and invalid values; keeps good ones', () => {
    const out = sanitizeCustomValues(DEFS, { t: 'ok', n: 5, s: 'gamma', d: '', ghost: 'x', u: UID, x: { a: 1 } });
    expect(out).toEqual({ t: 'ok', n: 5, u: UID });
  });
  it('handles missing input', () => {
    expect(sanitizeCustomValues(DEFS, undefined)).toEqual({});
    expect(sanitizeCustomValues([], { t: 'x' })).toEqual({});
  });
});

describe('validateCustomValues', () => {
  it('reports errors per field id', () => {
    expect(validateCustomValues(DEFS, { n: 'abc', s: 'alpha' })).toEqual({ n: 'Enter a number' });
    expect(validateCustomValues(DEFS, {})).toEqual({});
  });
});

describe('formatFieldValue', () => {
  it('resolves people by id', () => {
    expect(formatFieldValue(DEFS[4], UID, [{ id: UID, full_name: 'Ada', email: 'a@x.io' }])).toBe('Ada');
    expect(formatFieldValue(DEFS[4], UID, [])).toBe('Unknown user');
    expect(formatFieldValue(DEFS[1], 5)).toBe('5');
    expect(formatFieldValue(DEFS[0], undefined)).toBe('');
  });
});

describe('sortDefinitions', () => {
  it('orders by position then name without mutating', () => {
    const list = [def('b', 'text', { name: 'b', position: 1 }), def('a2', 'text', { name: 'a', position: 0 }), def('c', 'text', { name: 'c', position: 0 })];
    expect(sortDefinitions(list).map((d) => d.id)).toEqual(['a2', 'c', 'b']);
    expect(list[0].id).toBe('b');
  });
});

describe('new field types', () => {
  it('validates checkbox, url and currency values', () => {
    const cb = def('c', 'checkbox');
    expect(validateFieldValue(cb, true)).toBeNull();
    expect(validateFieldValue(cb, 'yes')).not.toBeNull();
    const url = def('l', 'url');
    expect(validateFieldValue(url, 'https://example.com/a')).toBeNull();
    expect(validateFieldValue(url, 'example.com')).not.toBeNull();
    expect(validateFieldValue(url, 'javascript:alert(1)')).not.toBeNull();
    const money = def('m', 'currency');
    expect(validateFieldValue(money, '12,50')).toBeNull();
    expect(validateFieldValue(money, 'abc')).toMatch(/amount/);
  });

  it('applies min, max and decimals (rounding first)', () => {
    const n = def('n', 'number', { min_value: 0, max_value: 10, decimals: 0 });
    expect(validateFieldValue(n, -1)).toMatch(/at least 0/);
    expect(validateFieldValue(n, '10.4')).toBeNull();
    expect(validateFieldValue(n, 11)).toMatch(/at most 10/);
    expect(coerceFieldInput(def('x', 'currency', { decimals: 2 }), '12.346')).toBe(12.35);
  });

  it('coerces checkbox input to booleans and keeps them when sanitizing', () => {
    const cb = def('c', 'checkbox');
    expect(coerceFieldInput(cb, false)).toBe(false);
    expect(sanitizeCustomValues([cb], { c: false })).toEqual({ c: false });
  });
});

describe('definition settings', () => {
  it('rejects bad currency codes and inverted limits', () => {
    expect(validateDefinition({ name: 'B', field_type: 'currency', currency: 'EURO' })).toMatch(/currency code/);
    expect(validateDefinition({ name: 'B', field_type: 'number', min_value: 5, max_value: 1 })).toMatch(/minimum/);
    expect(validateDefinition({ name: 'B', field_type: 'number', decimals: 7 })).toMatch(/Decimals/);
  });

  it('cleanDraft keeps only the settings a type uses', () => {
    expect(cleanDraft({ name: ' Effort ', field_type: 'text', unit: 'h', min_value: 1, options: ['a'] })).toEqual({
      name: 'Effort', field_type: 'text', options: [], unit: null, currency: null, min_value: null, max_value: null, decimals: null,
    });
    expect(cleanDraft({ name: 'B', field_type: 'currency', currency: 'usd', unit: 'h' })).toMatchObject({ currency: 'USD', unit: null });
  });

  it('describes a definition in one line', () => {
    expect(describeDefinition(def('e', 'number', { unit: 'h', min_value: 0, max_value: 100, decimals: 1 }))).toBe('Number · h · 0 – 100 · 1 decimal');
    expect(describeDefinition(def('b', 'currency'), 'CHF')).toBe('Currency · CHF');
  });
});

describe('formatting', () => {
  it('formats money, units, percent and checkboxes', () => {
    expect(formatFieldValue(def('m', 'currency', { decimals: 2 }), 1234.5, [], 'EUR')).toMatch(/1.?234[.,]50/);
    expect(formatFieldValue(def('m', 'currency', { decimals: 2 }), 1234.5, [], 'EUR')).toMatch(/€|EUR/);
    expect(formatFieldValue(def('e', 'number', { unit: 'h' }), 8)).toBe('8 h');
    expect(formatFieldValue(def('p', 'number', { unit: '%' }), 40)).toBe('40%');
    expect(formatFieldValue(def('c', 'checkbox'), false)).toBe('No');
  });

  it('formatMoney survives unknown currency codes', () => {
    expect(formatMoney(5, 'ZZZ')).toMatch(/5/);
    expect(formatMoney(undefined)).toBe('');
  });

  it('fieldSuffix falls back to the instance currency', () => {
    expect(fieldSuffix(def('m', 'currency'), 'GBP')).toBe('GBP');
    expect(fieldSuffix(def('m', 'currency', { currency: 'USD' }), 'GBP')).toBe('USD');
    expect(fieldSuffix(def('t', 'text'))).toBe('');
  });

  it('sorts global fields first', () => {
    const sorted = sortDefinitions([
      { ...def('a', 'text', { position: 0 }), scope: 'project' as const },
      { ...def('b', 'text', { position: 5 }), scope: 'global' as const },
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['b', 'a']);
  });
});

describe('rangeLabel', () => {
  it('shows both ends, one end, or nothing', () => {
    expect(rangeLabel({ min_value: 0, max_value: 200 })).toBe('0 – 200');
    expect(rangeLabel({ min_value: 0, max_value: null })).toBe('≥ 0');
    expect(rangeLabel({ min_value: null, max_value: 100 })).toBe('≤ 100');
    expect(rangeLabel({})).toBe('');
  });
});
