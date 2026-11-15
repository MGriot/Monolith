import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomFieldDefs } from '@/hooks/use-custom-field-defs';
import {
  COMMON_CURRENCIES,
  CUSTOM_FIELD_TYPES,
  MAX_DECIMALS,
  cleanDraft,
  describeDefinition,
  isNumeric,
  parseOptionsInput,
  toNumber,
  validateDefinition,
  type CustomFieldAppliesTo,
  type CustomFieldDef,
  type CustomFieldDraft,
  type CustomFieldType,
} from '@/lib/custom-fields';
import { confirmDialog } from '@/lib/confirm';
import { errorMessage } from '@/lib/api-error';
import { useCurrency } from '@/lib/queries';

const SELECT_CLASS = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

/** Form state: numbers stay text while typed. */
interface DraftState {
  name: string;
  field_type: CustomFieldType;
  options: string;
  unit: string;
  currency: string;
  min_value: string;
  max_value: string;
  decimals: string;
}

const EMPTY: DraftState = { name: '', field_type: 'text', options: '', unit: '', currency: '', min_value: '', max_value: '', decimals: '' };

function toDraftState(def: CustomFieldDef): DraftState {
  const s = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return {
    name: def.name,
    field_type: def.field_type,
    options: def.options.join(', '),
    unit: s(def.unit),
    currency: s(def.currency),
    min_value: s(def.min_value),
    max_value: s(def.max_value),
    decimals: s(def.decimals),
  };
}

function toDraft(s: DraftState): CustomFieldDraft {
  return cleanDraft({
    name: s.name,
    field_type: s.field_type,
    options: parseOptionsInput(s.options),
    unit: s.unit,
    currency: s.currency,
    min_value: toNumber(s.min_value),
    max_value: toNumber(s.max_value),
    decimals: s.decimals.trim() === '' ? null : Number(s.decimals),
  });
}

/** Name, type and the settings that type takes. `lockedType` on edit: the type of a field cannot change. */
function DefinitionEditor({ state, onChange, lockedType, instanceCurrency, idPrefix }: {
  state: DraftState;
  onChange: (s: DraftState) => void;
  lockedType?: boolean;
  instanceCurrency: string;
  idPrefix: string;
}) {
  const set = (patch: Partial<DraftState>) => onChange({ ...state, ...patch });
  const typeInfo = CUSTOM_FIELD_TYPES.find((t) => t.value === state.field_type);
  const badNumber = (v: string) => v.trim() !== '' && toNumber(v) === null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-name`} className={LABEL_CLASS}>Name</Label>
          <Input id={`${idPrefix}-name`} value={state.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Budget, Effort, Client" maxLength={100} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-type`} className={LABEL_CLASS}>Type</Label>
          <select
            id={`${idPrefix}-type`}
            value={state.field_type}
            disabled={lockedType}
            onChange={(e) => set({ field_type: e.target.value as CustomFieldType })}
            className={SELECT_CLASS}
          >
            {CUSTOM_FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      {typeInfo && <p className="text-[11px] text-fg-faint">{typeInfo.hint}{lockedType ? ' (the type cannot change once a field exists)' : ''}</p>}

      {state.field_type === 'select' && (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-options`} className={LABEL_CLASS}>Options</Label>
          <Input id={`${idPrefix}-options`} value={state.options} onChange={(e) => set({ options: e.target.value })} placeholder="Comma separated, e.g. Alpha, Beta" />
          {lockedType && <p className="text-[11px] text-fg-faint">Removing an option clears it wherever it is used.</p>}
        </div>
      )}

      {isNumeric(state.field_type) && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {state.field_type === 'number' ? (
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-unit`} className={LABEL_CLASS}>Unit</Label>
              <Input id={`${idPrefix}-unit`} value={state.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="h, kg, %" maxLength={32} />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-currency`} className={LABEL_CLASS}>Currency</Label>
              <select id={`${idPrefix}-currency`} value={state.currency} onChange={(e) => set({ currency: e.target.value })} className={SELECT_CLASS}>
                <option value="">Default ({instanceCurrency})</option>
                {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                {state.currency && !COMMON_CURRENCIES.includes(state.currency) && <option value={state.currency}>{state.currency}</option>}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-min`} className={LABEL_CLASS}>Minimum</Label>
            <Input id={`${idPrefix}-min`} inputMode="decimal" value={state.min_value} onChange={(e) => set({ min_value: e.target.value })} placeholder="none" aria-invalid={badNumber(state.min_value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-max`} className={LABEL_CLASS}>Maximum</Label>
            <Input id={`${idPrefix}-max`} inputMode="decimal" value={state.max_value} onChange={(e) => set({ max_value: e.target.value })} placeholder="none" aria-invalid={badNumber(state.max_value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-decimals`} className={LABEL_CLASS}>Decimals</Label>
            <select id={`${idPrefix}-decimals`} value={state.decimals} onChange={(e) => set({ decimals: e.target.value })} className={SELECT_CLASS}>
              <option value="">{state.field_type === 'currency' ? 'Currency default' : 'Any'}</option>
              {Array.from({ length: MAX_DECIMALS + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>
      )}
      {lockedType && isNumeric(state.field_type) && (
        <p className="text-[11px] text-fg-faint">Tightening the limits clears values that fall outside them.</p>
      )}
    </div>
  );
}

function draftError(s: DraftState, existing: CustomFieldDef[], selfId?: string): string | null {
  if (isNumeric(s.field_type)) {
    for (const [label, v] of [['minimum', s.min_value], ['maximum', s.max_value]] as const) {
      if (v.trim() !== '' && toNumber(v) === null) return `The ${label} must be a number`;
    }
  }
  return validateDefinition(toDraft(s), existing, selfId);
}

interface CustomFieldsManagerProps {
  /** Project whose own fields are managed; omit with scope "global". */
  projectId?: string;
  appliesTo: CustomFieldAppliesTo;
  /** project: a project admin manages the project's own fields (global ones show read-only). global: superuser settings. */
  scope?: 'project' | 'global';
  title?: string;
  description?: string;
}

/** Define custom fields: the project's own (project settings) or global ones (admin settings). */
export default function CustomFieldsManager({ projectId, appliesTo, scope = 'project', title, description }: CustomFieldsManagerProps) {
  const queryClient = useQueryClient();
  const instanceCurrency = useCurrency();
  const isGlobal = scope === 'global';
  const { data: defs = [], isLoading } = useCustomFieldDefs(isGlobal ? null : projectId, appliesTo);
  const [draft, setDraft] = useState<DraftState>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; state: DraftState } | null>(null);

  const base = isGlobal ? '/custom-fields' : `/projects/${projectId}/custom-fields`;
  const what = appliesTo === 'project' ? 'project' : 'task';
  const refresh = () => {
    // A global change reaches every project's list, and values may have been cleared server-side
    queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
    queryClient.invalidateQueries({ queryKey: [appliesTo === 'project' ? 'project' : 'tasks'] });
    if (appliesTo === 'project') queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const create = useMutation({
    mutationFn: async () => (await api.post(base, { ...toDraft(draft), applies_to: appliesTo })).data,
    onSuccess: () => {
      setDraft(EMPTY);
      refresh();
      toast.success('Field added');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not add the field')),
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; state: DraftState }) => {
      // The type is fixed and only select fields take options; number settings go as-is (null clears)
      const { field_type, options, ...changes } = toDraft(v.state);
      return (await api.put(`${base}/${v.id}`, field_type === 'select' ? { ...changes, options } : changes)).data;
    },
    onSuccess: () => {
      setEditing(null);
      refresh();
      toast.success('Field saved');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not save the field')),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`${base}/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Field deleted');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not delete the field')),
  });

  const newError = draft.name.trim() || draft.options.trim() ? draftError(draft, defs) : null;

  const confirmDelete = (def: CustomFieldDef) => {
    const where = isGlobal ? `every ${what} in every project` : appliesTo === 'project' ? 'this project' : 'every task of this project';
    void confirmDialog({
      title: `Delete the field “${def.name}”?`,
      description: `Its values are removed from ${where}.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    }).then((ok) => {
      if (ok) remove.mutate(def.id);
    });
  };

  const defaultTitle = isGlobal ? (appliesTo === 'project' ? 'Global project fields' : 'Global task fields') : appliesTo === 'project' ? 'Project fields' : 'Task fields';
  const defaultDescription = isGlobal
    ? appliesTo === 'project'
      ? 'Fields every project gets. Project admins can add their own on top.'
      : 'Fields every task in every project gets. Project admins can add their own on top.'
    : appliesTo === 'project'
      ? 'Extra fields on this project itself, shown on the overview and in exports.'
      : 'Extra fields shown on every task of this project.';

  return (
    <Card data-testid={`custom-fields-${scope}-${appliesTo}`}>
      <CardHeader>
        <CardTitle className="text-lg">{title ?? defaultTitle}</CardTitle>
        <CardDescription>{description ?? defaultDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <Loader2 className="w-5 h-5 animate-spin text-fg-faint" />}
        <div className="space-y-2">
          {defs.map((def) => {
            const readOnly = !isGlobal && def.scope === 'global';
            const isEditing = editing?.id === def.id;
            if (isEditing) {
              const err = draftError(editing.state, defs, def.id);
              return (
                <div key={def.id} className="rounded-xl border border-primary/40 bg-subtle/50 p-4 space-y-3">
                  <DefinitionEditor
                    idPrefix={`cf-edit-${def.id}`}
                    state={editing.state}
                    onChange={(state) => setEditing({ id: def.id, state })}
                    lockedType
                    instanceCurrency={instanceCurrency}
                  />
                  {err && <p className="text-xs text-rose-500">{err}</p>}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={!!err || update.isPending} onClick={() => update.mutate(editing)}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div key={def.id} className="flex items-center gap-3 rounded-xl border border-hairline bg-subtle/50 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm truncate">{def.name}</span>
                    {readOnly && (
                      <Badge variant="secondary" className="gap-1 text-[11px]" title="Defined by an administrator for every project">
                        <Globe className="h-3 w-3" /> Global
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{describeDefinition(def, instanceCurrency)}</p>
                </div>
                {!readOnly && (
                  <>
                    <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => setEditing({ id: def.id, state: toDraftState(def) })}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <button type="button" aria-label={`Delete ${def.name}`} onClick={() => confirmDelete(def)} className="p-2 text-fg-ghost hover:text-rose-500 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {!isLoading && defs.length === 0 && <p className="text-sm text-fg-faint">No fields yet.</p>}
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label className={LABEL_CLASS}>New field</Label>
          <DefinitionEditor idPrefix={`cf-new-${scope}-${appliesTo}`} state={draft} onChange={setDraft} instanceCurrency={instanceCurrency} />
          {newError && <p className="text-xs text-rose-500">{newError}</p>}
          <Button type="button" className="gap-2" disabled={!draft.name.trim() || !!newError || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add field
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
