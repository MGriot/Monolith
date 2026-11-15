import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  coerceFieldInput,
  currencySymbol,
  fieldInputValue,
  isNumeric,
  rangeLabel,
  validateFieldValue,
  type CustomFieldDef,
  type CustomValues,
} from '@/lib/custom-fields';
import { useCurrency, usersQuery } from '@/lib/queries';
import { useCustomFieldDefs } from '@/hooks/use-custom-field-defs';

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** A number/currency input showing the unit or currency symbol inside it. `text` is what was typed. */
function NumberInput({ def, text, onChange, id, currency, disabled }: {
  def: CustomFieldDef;
  text: string;
  onChange: (raw: string) => void;
  id: string;
  currency: string;
  disabled?: boolean;
}) {
  const suffix = def.field_type === 'currency' ? currencySymbol(def.currency || currency) : def.unit;
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        className={suffix ? 'pr-14' : undefined}
        placeholder={rangeLabel(def) || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-fg-faint">
          {suffix}
        </span>
      )}
    </div>
  );
}

interface CustomFieldInputsProps {
  defs: CustomFieldDef[];
  values: CustomValues;
  onChange: (values: CustomValues) => void;
  disabled?: boolean;
}

/** Inputs for a list of definitions, bound to a `custom_values` object. */
export function CustomFieldInputs({ defs, values, onChange, disabled }: CustomFieldInputsProps) {
  const currency = useCurrency();
  const needsUsers = defs.some((d) => d.field_type === 'user');
  const { data: users } = useQuery({ ...usersQuery, enabled: needsUsers });
  // Raw text of number inputs, so validation sees "abc" even though nothing is stored for it
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const set = (def: CustomFieldDef, raw: string | boolean) => {
    const next = { ...values };
    const value = coerceFieldInput(def, raw);
    if (value === undefined) delete next[def.id];
    else next[def.id] = value;
    if (typeof raw === 'string' && isNumeric(def.field_type)) setDrafts((d) => ({ ...d, [def.id]: raw }));
    onChange(next);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" data-testid="custom-field-inputs">
      {defs.map((def) => {
        const stored = values[def.id];
        const raw = isNumeric(def.field_type) && def.id in drafts ? drafts[def.id] : fieldInputValue(stored);
        const error = def.field_type === 'checkbox' ? null : validateFieldValue(def, raw);
        const id = `cf-${def.id}`;
        return (
          <div key={def.id} className="space-y-2">
            <Label htmlFor={id} className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-fg-faint tracking-[0.2em] px-1">
              {def.name}
              {def.scope === 'global' && <Globe className="h-3 w-3" aria-label="Global field" />}
            </Label>
            {def.field_type === 'select' || def.field_type === 'user' ? (
              <select id={id} className={SELECT_CLASS} value={raw} disabled={disabled} onChange={(e) => set(def, e.target.value)}>
                <option value="">—</option>
                {def.field_type === 'select'
                  ? def.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))
                  : (users ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
              </select>
            ) : def.field_type === 'checkbox' ? (
              <div className="flex h-10 items-center gap-3 px-1">
                <Switch id={id} checked={stored === true} disabled={disabled} onCheckedChange={(v) => set(def, v)} />
                <span className="text-sm text-muted-foreground">{stored === true ? 'Yes' : stored === false ? 'No' : 'Not set'}</span>
              </div>
            ) : isNumeric(def.field_type) ? (
              <NumberInput def={def} id={id} text={raw} currency={currency} disabled={disabled} onChange={(r) => set(def, r)} />
            ) : def.field_type === 'url' ? (
              <div className="flex items-center gap-2">
                <Input id={id} type="url" placeholder="https://" value={raw} disabled={disabled} onChange={(e) => set(def, e.target.value)} />
                {raw && !error && (
                  <a href={raw} target="_blank" rel="noopener noreferrer" aria-label={`Open ${def.name}`} className="p-2 text-fg-faint hover:text-primary">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : (
              <Input
                id={id}
                type={def.field_type === 'date' ? 'date' : 'text'}
                value={raw}
                disabled={disabled}
                onChange={(e) => set(def, e.target.value)}
              />
            )}
            {error && <p className="text-xs font-bold text-red-500 px-1">{error}</p>}
          </div>
        );
      })}
    </div>
  );
}

interface TaskCustomFieldsProps {
  projectId?: string;
  values: CustomValues;
  onChange: (values: CustomValues) => void;
}

/** The custom fields of a task: global task fields plus the project's own. */
export default function TaskCustomFields({ projectId, values, onChange }: TaskCustomFieldsProps) {
  const { data: defs, isLoading } = useCustomFieldDefs(projectId, 'task');
  if (isLoading) return <p className="text-sm text-fg-faint text-center py-10">Loading…</p>;
  if (!defs || defs.length === 0) {
    return (
      <p className="text-sm text-fg-faint text-center py-10">
        {projectId ? 'This project has no task fields yet. Add them under Project Settings.' : 'There are no global task fields yet.'}
      </p>
    );
  }
  return <CustomFieldInputs defs={defs} values={values} onChange={onChange} />;
}

/** The custom fields of a project itself: global project fields plus the project's own. */
export function ProjectCustomFields({ projectId, values, onChange }: TaskCustomFieldsProps) {
  const { data: defs, isLoading } = useCustomFieldDefs(projectId, 'project');
  if (isLoading) return <p className="text-sm text-fg-faint text-center py-10">Loading…</p>;
  if (!defs || defs.length === 0) {
    return (
      <p className="text-sm text-fg-faint text-center py-10">
        No project fields yet. Project admins add them under Settings; administrators can add global ones.
      </p>
    );
  }
  return <CustomFieldInputs defs={defs} values={values} onChange={onChange} />;
}
