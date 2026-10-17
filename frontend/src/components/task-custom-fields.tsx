import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  coerceFieldInput,
  fieldInputValue,
  sortDefinitions,
  validateFieldValue,
  type CustomFieldDef,
  type CustomValues,
} from '@/lib/custom-fields';
import type { User } from '@/types';

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function useCustomFieldDefs(projectId?: string) {
  return useQuery({
    queryKey: ['custom-fields', projectId],
    queryFn: async () => sortDefinitions((await api.get(`/projects/${projectId}/custom-fields`)).data as CustomFieldDef[]),
    enabled: !!projectId,
  });
}

interface TaskCustomFieldsProps {
  projectId?: string;
  values: CustomValues;
  onChange: (values: CustomValues) => void;
}

/** Inputs for the project's custom fields, bound to a task's `custom_values`. */
export default function TaskCustomFields({ projectId, values, onChange }: TaskCustomFieldsProps) {
  const { data: defs, isLoading } = useCustomFieldDefs(projectId);
  const needsUsers = !!defs?.some((d) => d.field_type === 'user');
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users/')).data as User[],
    enabled: needsUsers,
  });

  const set = (def: CustomFieldDef, raw: string) => {
    const next = { ...values };
    const value = coerceFieldInput(def, raw);
    if (value === undefined) delete next[def.id];
    else next[def.id] = value;
    onChange(next);
  };

  if (!projectId) return <p className="text-sm text-fg-faint text-center py-10">Custom fields belong to a project.</p>;
  if (isLoading) return <p className="text-sm text-fg-faint text-center py-10">Loading…</p>;
  if (!defs || defs.length === 0) {
    return (
      <p className="text-sm text-fg-faint text-center py-10">
        This project has no custom fields yet. Add them under Project Settings.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6" data-testid="task-custom-fields">
      {defs.map((def) => {
        const raw = fieldInputValue(values[def.id]);
        const error = validateFieldValue(def, raw);
        const id = `cf-${def.id}`;
        return (
          <div key={def.id} className="space-y-2">
            <Label htmlFor={id} className="text-[10px] font-black uppercase text-fg-faint tracking-[0.2em] px-1">
              {def.name}
            </Label>
            {def.field_type === 'select' || def.field_type === 'user' ? (
              <select id={id} className={SELECT_CLASS} value={raw} onChange={(e) => set(def, e.target.value)}>
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
            ) : (
              <Input
                id={id}
                type={def.field_type === 'date' ? 'date' : 'text'}
                inputMode={def.field_type === 'number' ? 'decimal' : undefined}
                value={raw}
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
