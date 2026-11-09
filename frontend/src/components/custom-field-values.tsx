import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Globe, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomFieldDefs } from '@/hooks/use-custom-field-defs';
import { formatFieldValue, type CustomFieldDef, type CustomValues } from '@/lib/custom-fields';
import { useCurrency, usersQuery } from '@/lib/queries';

/** One formatted value: links are clickable, empty values show a dash. */
export function CustomFieldValue({ def, value, users, currency }: {
  def: CustomFieldDef;
  value: CustomValues[string] | undefined;
  users?: { id: string; full_name?: string | null; email?: string }[];
  currency: string;
}) {
  const text = formatFieldValue(def, value, users, currency);
  if (!text) return <span className="text-fg-ghost">—</span>;
  if (def.field_type === 'url') {
    return (
      <a href={text} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline truncate max-w-full">
        {text.replace(/^https?:\/\//, '')}
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    );
  }
  return <span className="truncate">{text}</span>;
}

/** Project overview: the values of the project's own custom fields (hidden while it has none defined). */
export function ProjectFieldValuesCard({ projectId, values }: { projectId: string; values?: CustomValues }) {
  const currency = useCurrency();
  const { data: defs = [] } = useCustomFieldDefs(projectId, 'project');
  const { data: users } = useQuery({ ...usersQuery, enabled: defs.some((d) => d.field_type === 'user') });
  if (defs.length === 0) return null;
  return (
    <Card className="border-border" data-testid="project-field-values">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-fg-faint">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Project fields
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          {defs.map((def) => (
            <div key={def.id} className="min-w-0">
              <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                {def.name}
                {def.scope === 'global' && <Globe className="h-3 w-3" aria-label="Global field" />}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-fg-body tabular-nums">
                <CustomFieldValue def={def} value={values?.[def.id]} users={users} currency={currency} />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
