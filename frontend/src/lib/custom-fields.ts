// Pure helpers for custom fields. Mirrors backend/app/core/custom_fields.py: values are stored on
// `project.custom_values` (applies_to 'project') or `task.custom_values` (applies_to 'task'), keyed by the definition id.

export type CustomFieldType = 'text' | 'number' | 'currency' | 'select' | 'date' | 'user' | 'checkbox' | 'url';
export type CustomFieldAppliesTo = 'project' | 'task';
export type CustomFieldScope = 'global' | 'project';

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'Free text' },
  { value: 'number', label: 'Number', hint: 'A number, optionally with a unit (h, kg, %)' },
  { value: 'currency', label: 'Currency', hint: 'An amount of money' },
  { value: 'select', label: 'Select', hint: 'One of a list of options' },
  { value: 'date', label: 'Date', hint: 'A calendar date' },
  { value: 'user', label: 'Person', hint: 'Someone with an account' },
  { value: 'checkbox', label: 'Checkbox', hint: 'Yes or no' },
  { value: 'url', label: 'Link', hint: 'A web address' },
];

export const NUMERIC_TYPES: CustomFieldType[] = ['number', 'currency'];
export const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'INR', 'BRL'];
export const MAX_DECIMALS = 6;

export interface CustomFieldDef {
  id: string;
  project_id: string | null;
  scope?: CustomFieldScope;
  applies_to?: CustomFieldAppliesTo;
  name: string;
  field_type: CustomFieldType;
  options: string[];
  unit?: string | null;
  currency?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  decimals?: number | null;
  position: number;
}

/** What the definition editor sends (create or update). */
export interface CustomFieldDraft {
  name: string;
  field_type: CustomFieldType;
  options?: string[];
  unit?: string | null;
  currency?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  decimals?: number | null;
}

export type CustomValue = string | number | boolean;
export type CustomValues = Record<string, CustomValue>;

const MAX_TEXT = 5000;
const MAX_URL = 2048;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY_RE = /^[A-Z]{3}$/;

export const isNumeric = (t: CustomFieldType) => NUMERIC_TYPES.includes(t);

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

/** Why a definition cannot be saved, or null. `existing` is every field the same project sees. */
export function validateDefinition(
  def: CustomFieldDraft,
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
  if (def.unit && def.unit.trim().length > 32) return 'The unit can be at most 32 characters';
  if (def.currency && !CURRENCY_RE.test(def.currency.trim().toUpperCase())) return 'Use a 3-letter currency code such as EUR';
  if (def.min_value != null && def.max_value != null && def.min_value > def.max_value) {
    return 'The minimum cannot be greater than the maximum';
  }
  if (def.decimals != null && (def.decimals < 0 || def.decimals > MAX_DECIMALS || !Number.isInteger(def.decimals))) {
    return `Decimals must be a whole number from 0 to ${MAX_DECIMALS}`;
  }
  return null;
}

/** Keep only the settings a type uses, so the API never sees a unit on a text field. */
export function cleanDraft(def: CustomFieldDraft): CustomFieldDraft {
  const numeric = isNumeric(def.field_type);
  return {
    name: def.name.trim(),
    field_type: def.field_type,
    options: def.field_type === 'select' ? def.options ?? [] : [],
    unit: def.field_type === 'number' ? def.unit?.trim() || null : null,
    currency: def.field_type === 'currency' ? def.currency?.trim().toUpperCase() || null : null,
    min_value: numeric ? def.min_value ?? null : null,
    max_value: numeric ? def.max_value ?? null : null,
    decimals: numeric ? def.decimals ?? null : null,
  };
}

export function toNumber(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
}

function roundTo(n: number, decimals: number | null | undefined): number {
  if (decimals == null) return n;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function numberError(def: CustomFieldDef, n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return def.field_type === 'currency' ? 'Enter an amount' : 'Enter a number';
  const v = roundTo(n, def.decimals);
  if (def.min_value != null && v < def.min_value) return `Must be at least ${def.min_value}`;
  if (def.max_value != null && v > def.max_value) return `Must be at most ${def.max_value}`;
  return null;
}

/** Why a typed/selected value is invalid for a definition, or null. Empty input is always valid (it clears the value). */
export function validateFieldValue(def: CustomFieldDef, raw: string | number | boolean | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  switch (def.field_type) {
    case 'text':
      return String(raw).length > MAX_TEXT ? `Keep it under ${MAX_TEXT} characters` : null;
    case 'number':
    case 'currency':
      if (typeof raw === 'boolean') return 'Enter a number';
      return numberError(def, typeof raw === 'number' ? raw : toNumber(raw));
    case 'select':
      return def.options.includes(String(raw)) ? null : 'Pick one of the options';
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) && !Number.isNaN(Date.parse(String(raw))) ? null : 'Enter a valid date';
    case 'user':
      return UUID_RE.test(String(raw)) ? null : 'Pick a person';
    case 'checkbox':
      return typeof raw === 'boolean' ? null : 'Tick or untick';
    case 'url': {
      const s = String(raw).trim();
      if (s.length > MAX_URL) return 'The link is too long';
      try {
        const u = new URL(s);
        return (u.protocol === 'http:' || u.protocol === 'https:') && u.host ? null : 'Enter an http(s) link';
      } catch {
        return 'Enter a full link, e.g. https://example.com';
      }
    }
  }
}

/** Turn what an input holds into the value stored on the task or project (undefined = clear). */
export function coerceFieldInput(def: CustomFieldDef, raw: string | boolean): CustomValue | undefined {
  if (def.field_type === 'checkbox') return typeof raw === 'boolean' ? raw : raw === 'true';
  if (raw === '' || raw === undefined || typeof raw === 'boolean') return undefined;
  if (isNumeric(def.field_type)) {
    const n = toNumber(raw);
    return n === null ? undefined : roundTo(n, def.decimals);
  }
  if (def.field_type === 'url') return raw.trim();
  return raw;
}

/** What to show in an <input> for a stored value. */
export function fieldInputValue(value: CustomValue | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Prepare `custom_values` for saving: keep only values whose definition still exists and that are valid,
 * dropping empties. Stale ids (field deleted elsewhere) are removed so the API does not reject the whole object.
 */
export function sanitizeCustomValues(defs: CustomFieldDef[], values: Record<string, unknown> | null | undefined): CustomValues {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const out: CustomValues = {};
  for (const [id, value] of Object.entries(values ?? {})) {
    const def = byId.get(id);
    if (!def || value === null || value === undefined || value === '') continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
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
    const err = validateFieldValue(def, value as string | number | boolean | null | undefined);
    if (err) errors[def.id] = err;
  }
  return errors;
}

/** "€1,234.50" in the instance currency (or `currency`); falls back to "1234.5 XYZ" for codes Intl rejects. */
export function formatMoney(value: number | null | undefined, currency = 'EUR', decimals?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const digits = decimals == null ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, ...digits }).format(value);
  } catch {
    return `${new Intl.NumberFormat(undefined, digits).format(value)} ${currency}`;
  }
}

/** The symbol of a currency in the user's locale ("€", "$", "CHF"). */
export function currencySymbol(currency = 'EUR'): string {
  try {
    const part = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** The unit or currency shown next to an input or in a column header, or ''. */
export function fieldSuffix(def: CustomFieldDef, instanceCurrency = 'EUR'): string {
  if (def.field_type === 'number') return def.unit ?? '';
  if (def.field_type === 'currency') return def.currency || instanceCurrency;
  return '';
}

/** Human-readable value for lists and cards. */
export function formatFieldValue(
  def: CustomFieldDef,
  value: CustomValue | null | undefined,
  users: { id: string; full_name?: string | null; email?: string }[] = [],
  instanceCurrency = 'EUR',
): string {
  if (value === null || value === undefined || value === '') return '';
  switch (def.field_type) {
    case 'user': {
      const u = users.find((x) => x.id === value);
      return u ? u.full_name || u.email || String(value) : 'Unknown user';
    }
    case 'checkbox':
      return value ? 'Yes' : 'No';
    case 'currency':
      return typeof value === 'number' ? formatMoney(value, def.currency || instanceCurrency, def.decimals) : String(value);
    case 'number': {
      if (typeof value !== 'number') return String(value);
      const digits = def.decimals == null ? {} : { minimumFractionDigits: def.decimals, maximumFractionDigits: def.decimals };
      const n = new Intl.NumberFormat(undefined, digits).format(value);
      return def.unit ? (def.unit === '%' ? `${n}%` : `${n} ${def.unit}`) : n;
    }
    case 'date': {
      const d = new Date(String(value).length === 10 ? `${value}T00:00:00` : String(value));
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
    default:
      return String(value);
  }
}

/** The allowed range: "0 – 200", "≥ 0", "≤ 100", or '' without limits. */
export function rangeLabel(def: Pick<CustomFieldDef, 'min_value' | 'max_value'>): string {
  const { min_value: lo, max_value: hi } = def;
  if (lo != null && hi != null) return `${lo} – ${hi}`;
  if (lo != null) return `≥ ${lo}`;
  if (hi != null) return `≤ ${hi}`;
  return '';
}

/** One line describing a definition's settings, e.g. "Number · h · 0 – 100 · 1 decimal". */
export function describeDefinition(def: CustomFieldDef, instanceCurrency = 'EUR'): string {
  const type = CUSTOM_FIELD_TYPES.find((t) => t.value === def.field_type)?.label ?? def.field_type;
  const parts = [type];
  if (def.field_type === 'select') parts.push(def.options.join(', '));
  const suffix = fieldSuffix(def, instanceCurrency);
  if (suffix) parts.push(suffix);
  const range = rangeLabel(def);
  if (range) parts.push(range);
  if (def.decimals != null) parts.push(`${def.decimals} decimal${def.decimals === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** Definitions in display order: global first, then by position, then name. */
export function sortDefinitions<T extends Pick<CustomFieldDef, 'position' | 'name'> & { scope?: CustomFieldScope }>(defs: T[]): T[] {
  const rank = (d: T) => (d.scope === 'global' ? 0 : 1);
  return [...defs].sort((a, b) => rank(a) - rank(b) || a.position - b.position || a.name.localeCompare(b.name));
}
