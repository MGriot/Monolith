import { useId, useMemo, useState } from 'react';
import { Bookmark, Check, ChevronDown, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DEFAULT_FILTERS, GROUP_KEYS, SORT_KEYS, UNASSIGNED, hasActiveFilters, isDefaultView,
  type GroupKey, type SortKey, type TaskFilters,
} from '@/lib/task-filters';
import { deleteView, findMatchingView, loadViews, saveView, type SavedView, type ViewScope } from '@/lib/saved-views';

const STATUSES = ['Backlog', 'Todo', 'In Progress', 'Review', 'On Hold', 'Done'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const SORT_LABELS: Record<SortKey, string> = {
  manual: 'Manual order', due: 'Due date', priority: 'Priority', status: 'Status', title: 'Title', created: 'Created',
};
const GROUP_LABELS: Record<GroupKey, string> = { none: 'No grouping', status: 'Status', priority: 'Priority', assignee: 'Assignee' };

const getStore = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

interface MultiProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function MultiSelect({ label, options, selected, onChange }: MultiProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-semibold">
          {label}
          {selected.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{selected.length}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-400">Nothing to filter by</div>}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => onChange(toggle(selected, o.value))}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface TaskFilterBarProps {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  assignees: { id: string; label: string }[];
  scope: ViewScope;
  /** Sort/group only affect list layouts; the Kanban board keeps its manual column order. */
  showLayoutControls?: boolean;
  resultCount?: number;
}

export default function TaskFilterBar({ filters, onChange, assignees, scope, showLayoutControls = true, resultCount }: TaskFilterBarProps) {
  const uid = useId();
  const [views, setViews] = useState<SavedView[]>(() => loadViews(getStore(), scope));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const active = useMemo(() => findMatchingView(views, filters), [views, filters]);

  const patch = (p: Partial<TaskFilters>) => onChange({ ...filters, ...p });
  const assigneeOptions = [{ value: UNASSIGNED, label: 'Unassigned' }, ...assignees.map((a) => ({ value: a.id, label: a.label }))];

  const commitSave = () => {
    if (!name.trim()) return;
    setViews(saveView(getStore(), scope, name, filters));
    setName('');
    setNaming(false);
  };

  return (
    <div role="search" aria-label="Filter tasks" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          aria-label="Filter tasks by title"
          placeholder="Filter tasks..."
          className="h-9 pl-8 text-sm"
          value={filters.q}
          onChange={(e) => patch({ q: e.target.value })}
        />
      </div>

      <MultiSelect label="Status" options={STATUSES.map((s) => ({ value: s, label: s }))} selected={filters.status} onChange={(status) => patch({ status })} />
      <MultiSelect label="Priority" options={PRIORITIES.map((p) => ({ value: p, label: p }))} selected={filters.priority} onChange={(priority) => patch({ priority })} />
      <MultiSelect label="Assignee" options={assigneeOptions} selected={filters.assignee} onChange={(assignee) => patch({ assignee })} />

      {showLayoutControls && (
        <>
          <label htmlFor={`${uid}-sort`} className="sr-only">Sort by</label>
          <select
            id={`${uid}-sort`}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs font-semibold"
            value={filters.sort}
            onChange={(e) => patch({ sort: e.target.value as SortKey })}
          >
            {SORT_KEYS.map((k) => <option key={k} value={k}>Sort: {SORT_LABELS[k]}</option>)}
          </select>
          {filters.sort !== 'manual' && (
            <Button
              variant="outline" size="sm" className="h-9 text-xs font-semibold"
              aria-label={`Sort direction: ${filters.dir === 'asc' ? 'ascending' : 'descending'}`}
              onClick={() => patch({ dir: filters.dir === 'asc' ? 'desc' : 'asc' })}
            >
              {filters.dir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </Button>
          )}
          <label htmlFor={`${uid}-group`} className="sr-only">Group by</label>
          <select
            id={`${uid}-group`}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs font-semibold"
            value={filters.group}
            onChange={(e) => patch({ group: e.target.value as GroupKey })}
          >
            {GROUP_KEYS.map((k) => <option key={k} value={k}>Group: {GROUP_LABELS[k]}</option>)}
          </select>
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-semibold">
            <Bookmark className="h-3.5 w-3.5" aria-hidden />
            {active ? active.name : 'Views'}
            <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => onChange(DEFAULT_FILTERS)}>
            <span className="flex-1">All tasks</span>
            {isDefaultView(filters) && <Check className="h-3.5 w-3.5" aria-hidden />}
          </DropdownMenuItem>
          {views.map((v) => (
            <DropdownMenuItem key={v.id} onSelect={() => onChange(v.filters)} className="group">
              <span className="flex-1 truncate">{v.name}</span>
              {active?.id === v.id && <Check className="h-3.5 w-3.5" aria-hidden />}
              <button
                type="button"
                aria-label={`Delete view ${v.name}`}
                className="ml-2 rounded p-0.5 text-slate-400 hover:text-destructive focus-visible:ring-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setViews(deleteView(getStore(), scope, v.id));
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={isDefaultView(filters)} onSelect={() => setNaming(true)}>
            Save current view...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {naming && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); commitSave(); }}
        >
          <Input
            autoFocus
            aria-label="Name for the saved view"
            placeholder="View name"
            maxLength={60}
            className="h-9 w-40 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setNaming(false); setName(''); } }}
          />
          <Button type="submit" size="sm" className="h-9" disabled={!name.trim()}>Save</Button>
        </form>
      )}

      {(hasActiveFilters(filters) || !isDefaultView(filters)) && (
        <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs text-slate-500" onClick={() => onChange(DEFAULT_FILTERS)}>
          <X className="h-3.5 w-3.5" aria-hidden /> Reset
        </Button>
      )}
      {resultCount !== undefined && hasActiveFilters(filters) && (
        <span className="text-xs text-slate-500" role="status">{resultCount} matching</span>
      )}
    </div>
  );
}
