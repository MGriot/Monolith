import { describe, expect, it } from 'vitest';
import {
  coerceFieldInput,
  formatFieldValue,
  parseOptionsInput,
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
