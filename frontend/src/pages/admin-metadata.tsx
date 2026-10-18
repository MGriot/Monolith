import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Search, Tag } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageBody, PageHeader } from '@/components/ui/page-header';
import { selectClass } from '@/components/ui/field';
import { TaxonomyPanel, type TaxonomyItem } from '@/components/taxonomy-list';
import { useTitle } from '@/context/title-context';
import { confirmDialog } from '@/lib/confirm';
import { filterTaxonomy, groupTaxonomy, type TaxonomyScope } from '@/lib/taxonomy';
import { nextPresetColor } from '@/constants/colors';
import { cn } from '@/lib/utils';
import type { Project, Topic, WorkType } from '@/types';

type Kind = 'topics' | 'work-types';

const errorText = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

/** Topics and work types for every scope on one page: no tabs, inline editing. */
export default function AdminMetadataPage() {
  const queryClient = useQueryClient();
  const { setTitle } = useTitle();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<TaxonomyScope>('all');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    setTitle('Metadata');
    return () => setTitle(null);
  }, [setTitle]);

  const { data: topics, isLoading: topicsLoading } = useQuery<Topic[]>({
    queryKey: ['metadata', 'topics', 'all'],
    queryFn: async () => (await api.get('/metadata/topics?all_scopes=true')).data,
  });

  const { data: workTypes, isLoading: typesLoading } = useQuery<WorkType[]>({
    queryKey: ['metadata', 'work-types', 'all'],
    queryFn: async () => (await api.get('/metadata/work-types?all_scopes=true')).data,
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => (await api.get('/projects/')).data,
  });

  const projectNames = useMemo(() => new Map((projects || []).map(p => [p.id, p.name])), [projects]);

  const invalidate = (kind: Kind) => queryClient.invalidateQueries({ queryKey: ['metadata', kind] });

  const create = useMutation({
    mutationFn: ({ kind, name, color }: { kind: Kind; name: string; color: string }) =>
      api.post(`/metadata/${kind}`, { name, color }),
    onSuccess: (_, { kind, name }) => {
      invalidate(kind);
      toast.success(`Added “${name}”`);
    },
    onError: (err) => toast.error(errorText(err, 'Could not add it')),
  });

  const update = useMutation({
    mutationFn: ({ kind, item, patch }: { kind: Kind; item: TaxonomyItem; patch: Partial<TaxonomyItem> }) =>
      api.put(`/metadata/${kind}/${item.id}`, {
        name: item.name,
        color: item.color,
        is_active: item.is_active,
        project_id: item.project_id,
        task_id: item.task_id,
        ...patch,
      }),
    // Optimistic: rows update as you type / toggle, and roll back if the server refuses.
    onMutate: async ({ kind, item, patch }) => {
      const key = ['metadata', kind, 'all'];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaxonomyItem[]>(key);
      queryClient.setQueryData<TaxonomyItem[]>(key, (old) => old?.map(i => (i.id === item.id ? { ...i, ...patch } : i)));
      return { previous, key };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
      toast.error(errorText(err, 'Could not save the change'));
    },
    onSuccess: (_, { kind, item, patch }) => {
      if (patch.is_active !== undefined) {
        toast.success(`${item.name} ${patch.is_active ? 'activated' : 'deactivated'}`, {
          action: { label: 'Undo', onClick: () => update.mutate({ kind, item: { ...item, ...patch }, patch: { is_active: !patch.is_active } }) },
        });
      }
    },
    onSettled: (_, __, { kind }) => invalidate(kind),
  });

  const remove = useMutation({
    mutationFn: ({ kind, item }: { kind: Kind; item: TaxonomyItem }) => api.delete(`/metadata/${kind}/${item.id}`),
    onSuccess: (_, { kind, item }) => {
      invalidate(kind);
      toast.success(`Deleted “${item.name}”`);
    },
    onError: (err) => toast.error(errorText(err, 'Could not delete it')),
  });

  const askDelete = (kind: Kind, item: TaxonomyItem) => {
    void confirmDialog({
      title: `Delete “${item.name}”?`,
      description: 'Projects and tasks that use it lose this label. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    }).then((ok) => { if (ok) remove.mutate({ kind, item }); });
  };

  const filter = { search, scope, showInactive };
  const topicGroups = groupTaxonomy(filterTaxonomy(topics || [], filter), projectNames);
  const typeGroups = groupTaxonomy(filterTaxonomy(workTypes || [], filter), projectNames);
  const filtered = search.trim() !== '' || scope !== 'all';

  const panel = (kind: Kind) => {
    const isTopics = kind === 'topics';
    const all = (isTopics ? topics : workTypes) || [];
    const groups = isTopics ? topicGroups : typeGroups;
    const shown = groups.reduce((n, g) => n + g.items.length, 0);
    return (
      <TaxonomyPanel
        title={isTopics ? 'Topics' : 'Work types'}
        noun={isTopics ? 'topic' : 'work type'}
        icon={isTopics ? <Tag /> : <Briefcase />}
        groups={groups}
        total={filtered || !showInactive ? shown : all.length}
        isLoading={isTopics ? topicsLoading : typesLoading}
        suggestedColor={nextPresetColor(all.filter(i => !i.project_id && !i.task_id).map(i => i.color))}
        onCreate={(name, color) => create.mutateAsync({ kind, name, color })}
        onUpdate={(item, patch) => update.mutate({ kind, item, patch })}
        onDelete={(item) => askDelete(kind, item)}
        emptyText={filtered ? 'Nothing matches the filter.' : `No ${isTopics ? 'topics' : 'work types'} yet. Add the first one above.`}
      />
    );
  };

  return (
    <PageBody className="max-w-6xl">
      <PageHeader
        title="Metadata"
        description="Topics and work types label projects and tasks. Global ones are available in every project."
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name"
              aria-label="Filter topics and work types by name"
              className="h-9 pl-9"
            />
          </div>
          <select
            aria-label="Scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as TaxonomyScope)}
            className={cn(selectClass, 'w-auto min-w-[9rem]')}
          >
            <option value="all">All scopes</option>
            <option value="global">Global</option>
            <option value="project">Project</option>
            <option value="task">Single task</option>
          </select>
          <div className="flex items-center gap-2">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="text-sm font-normal text-fg-soft">Show inactive</Label>
          </div>
        </div>
      </PageHeader>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {panel('topics')}
        {panel('work-types')}
      </div>
    </PageBody>
  );
}
