import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomFieldDefs } from '@/components/task-custom-fields';
import {
  CUSTOM_FIELD_TYPES,
  parseOptionsInput,
  validateDefinition,
  type CustomFieldDef,
  type CustomFieldType,
} from '@/lib/custom-fields';
import { confirmDialog } from '@/lib/confirm';

const errorMessage = (e: any, fallback: string) => e?.response?.data?.detail || fallback;

/** Project settings: define the extra fields every task of the project can carry. */
export default function CustomFieldsManager({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: defs = [], isLoading } = useCustomFieldDefs(projectId);
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; options: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['custom-fields', projectId] });
  const base = `/projects/${projectId}/custom-fields`;

  const create = useMutation({
    mutationFn: async () => (await api.post(base, { name: name.trim(), field_type: type, options: parseOptionsInput(options) })).data,
    onSuccess: () => {
      setName('');
      setOptions('');
      refresh();
      toast.success('Field added');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not add the field')),
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; name: string; options?: string[] }) =>
      (await api.put(`${base}/${v.id}`, { name: v.name.trim(), ...(v.options ? { options: v.options } : {}) })).data,
    onSuccess: () => {
      setEditing(null);
      refresh();
      // Shrinking a select's options clears tasks' values server-side
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not save the field')),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`${base}/${id}`),
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Field deleted');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not delete the field')),
  });

  const newError = name.trim() || options.trim() ? validateDefinition({ name, field_type: type, options: parseOptionsInput(options) }, defs) : null;
  const editError = (def: CustomFieldDef) =>
    editing && editing.id === def.id
      ? validateDefinition(
          { name: editing.name, field_type: def.field_type, options: def.field_type === 'select' ? parseOptionsInput(editing.options) : undefined },
          defs,
          def.id,
        )
      : null;

  const confirmDelete = (def: CustomFieldDef) => {
    void confirmDialog({ title: `Delete the field “${def.name}”?`, description: 'Its values are removed from every task.', confirmLabel: 'Delete', tone: 'danger' }).then((ok) => { if (ok) { remove.mutate(def.id); } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Custom Fields</CardTitle>
        <CardDescription>Extra fields shown on every task of this project.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <Loader2 className="w-5 h-5 animate-spin text-fg-faint" />}
        <div className="space-y-2">
          {defs.map((def) => {
            const isEditing = editing?.id === def.id;
            const err = editError(def);
            return (
              <div key={def.id} className="rounded-xl border border-hairline bg-subtle/50 p-3 space-y-2">
                <div className="flex items-center gap-3">
                  {isEditing ? (
                    <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-9 flex-1" aria-label="Field name" />
                  ) : (
                    <span className="flex-1 font-bold text-sm">{def.name}</span>
                  )}
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                    {CUSTOM_FIELD_TYPES.find((t) => t.value === def.field_type)?.label}
                  </span>
                  {isEditing ? (
                    <>
                      <Button type="button" size="sm" disabled={!!err || update.isPending} onClick={() => update.mutate({ id: def.id, name: editing.name, options: def.field_type === 'select' ? parseOptionsInput(editing.options) : undefined })}>
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing({ id: def.id, name: def.name, options: def.options.join(', ') })}>
                        Edit
                      </Button>
                      <button type="button" aria-label={`Delete ${def.name}`} onClick={() => confirmDelete(def)} className="p-2 text-fg-ghost hover:text-rose-500 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
                {def.field_type === 'select' &&
                  (isEditing ? (
                    <div className="space-y-1">
                      <Input value={editing.options} onChange={(e) => setEditing({ ...editing, options: e.target.value })} placeholder="Options, comma separated" aria-label="Options" />
                      <p className="text-[11px] text-fg-faint">Removing an option clears it from tasks that use it.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{def.options.join(' · ')}</p>
                  ))}
                {err && <p className="text-xs text-rose-500">{err}</p>}
              </div>
            );
          })}
          {!isLoading && defs.length === 0 && <p className="text-sm text-fg-faint">No custom fields yet.</p>}
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">New field</Label>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Field name" maxLength={100} aria-label="New field name" />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
              aria-label="Field type"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {CUSTOM_FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {type === 'select' && <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Options, comma separated (e.g. Alpha, Beta)" aria-label="New field options" />}
          {newError && <p className="text-xs text-rose-500">{newError}</p>}
          <Button type="button" className="gap-2" disabled={!name.trim() || !!newError || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add field
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
