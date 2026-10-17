// Pure helpers for project custom fields. Mirrors backend/app/core/custom_fields.py: values are stored on
// `task.custom_values`, keyed by the definition id.

export type CustomFieldType = 'text' | 'number' | 'select' | 'date' | 'user';

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'date', label: 'Date' },
  { value: 'user', label: 'Person' },
];

export interface CustomFieldDef {
  id: string;
  project_id: string;
  name: string;
  field_type: CustomFieldType;
  options: string[];
  position: number;
}

export type CustomValue = string | number;
export type CustomValues = Record<string, CustomValue>;

const MAX_TEXT = 5000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "a, b ,a,," -> ["a", "b"] (trimmed, blanks and duplicates dropped, order kept). */
export function parseOptionsInput(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,\n]/)) {
    const opt = raw.trim();
    if (opt && !seen.has(opt)) {
      seen.add(opt);
      out.push(opt);
    }
  }
  return out;
}

/** Why a definition cannot be saved, or null. */
export function validateDefinition(
  def: { name: string; field_type: CustomFieldType; options?: string[] },
  existing: Pick<CustomFieldDef, 'id' | 'name'>[] = [],
  selfId?: string,
): string | null {
  const name = def.name.trim();
  if (!name) return 'Give the field a name';
  if (name.length > 100) return 'The name is too long (100 characters max)';
  if (existing.some((d) => d.id !== selfId && d.name.trim().toLowerCase() === name.toLowerCase())) {
    return 'A field with this name already exists';
  }
  if (def.field_type === 'select' && (def.options ?? []).length === 0) return 'A select field needs at least one option';
  return null;
}

/** Why a typed/selected value is invalid for a definition, or null. Empty input is always valid (it clears the value). */
export function validateFieldValue(def: CustomFieldDef, raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  switch (def.field_type) {
    case 'text':
      return String(raw).length > MAX_TEXT ? `Keep it under ${MAX_TEXT} characters` : null;
    case 'number':
      return typeof raw === 'number' ? (Number.isFinite(raw) ? null : 'Enter a number') : toNumber(raw) === null ? 'Enter a number' : null;
    case 'select':
      return def.options.includes(String(raw)) ? null : 'Pick one of the options';
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) && !Number.isNaN(Date.parse(String(raw))) ? null : 'Enter a valid date';
    case 'user':
      return UUID_RE.test(String(raw)) ? null : 'Pick a person';
  }
}

function toNumber(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
}

/** Turn what an input holds into the value stored on the task (undefined = clear). */
export function coerceFieldInput(def: CustomFieldDef, raw: string): CustomValue | undefined {
  if (raw === '' || raw === undefined) return undefined;
  if (def.field_type === 'number') return toNumber(raw) ?? undefined;
  return raw;
}

/** What to show in an <input> for a stored value. */
export function fieldInputValue(value: CustomValue | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Prepare `custom_values` for saving: keep only values whose definition still exists and that are valid,
 * dropping empties. Stale ids (field deleted elsewhere) are removed so the API does not reject the whole task.
 */
export function sanitizeCustomValues(defs: CustomFieldDef[], values: Record<string, unknown> | null | undefined): CustomValues {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const out: CustomValues = {};
  for (const [id, value] of Object.entries(values ?? {})) {
    const def = byId.get(id);
    if (!def || value === null || value === undefined || value === '') continue;
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    if (validateFieldValue(def, value) === null) out[id] = value;
  }
  return out;
}

/** Every problem in a values object, keyed by definition id (for form errors). */
export function validateCustomValues(defs: CustomFieldDef[], values: Record<string, unknown> | null | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const def of defs) {
    const value = (values ?? {})[def.id];
    if (typeof value === 'object' && value !== null) {
      errors[def.id] = 'Invalid value';
      continue;
    }
    const err = validateFieldValue(def, value as string | number | null | undefined);
    if (err) errors[def.id] = err;
  }
  return errors;
}

/** Human-readable value for lists and cards. */
export function formatFieldValue(def: CustomFieldDef, value: CustomValue | null | undefined, users: { id: string; full_name?: string | null; email?: string }[] = []): string {
  if (value === null || value === undefined || value === '') return '';
  if (def.field_type === 'user') {
    const u = users.find((x) => x.id === value);
    return u ? u.full_name || u.email || String(value) : 'Unknown user';
  }
  return String(value);
}

/** Definitions in display order (position, then name). */
export function sortDefinitions<T extends Pick<CustomFieldDef, 'position' | 'name'>>(defs: T[]): T[] {
  return [...defs].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}
