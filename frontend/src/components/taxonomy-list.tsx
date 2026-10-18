import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, Loader2, MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ColorDotPicker } from '@/components/ui/color-swatch-picker';
import { Eyebrow } from '@/components/ui/section';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface TaxonomyItem {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  project_id?: string | null;
  task_id?: string | null;
}

export interface TaxonomyGroupData {
  key: string;
  label: string;
  /** small note after the label, e.g. "project" */
  note?: string;
  items: TaxonomyItem[];
}

interface TaxonomyPanelProps {
  title: string;
  /** singular noun for placeholders and labels, e.g. "topic" */
  noun: string;
  icon?: ReactNode;
  groups: TaxonomyGroupData[];
  total: number;
  isLoading?: boolean;
  /** colour for the next quick-add, so new items don't all look the same */
  suggestedColor: string;
  onCreate: (name: string, color: string) => Promise<unknown>;
  onUpdate: (item: TaxonomyItem, patch: Partial<TaxonomyItem>) => void;
  onDelete: (item: TaxonomyItem) => void;
  emptyText: string;
}

/**
 * Topics or work types as one dense list: an add row on top, rows grouped by scope,
 * inline rename, colour and active toggle. Replaces the old tabs + table + edit dialog.
 */
export function TaxonomyPanel({
  title,
  noun,
  icon,
  groups,
  total,
  isLoading,
  suggestedColor,
  onCreate,
  onUpdate,
  onDelete,
  emptyText,
}: TaxonomyPanelProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(suggestedColor);
  const [pending, setPending] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the suggestion until the user picks a colour themselves.
  const [colorTouched, setColorTouched] = useState(false);
  useEffect(() => {
    if (!colorTouched) setColor(suggestedColor);
  }, [suggestedColor, colorTouched]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    try {
      await onCreate(trimmed, color);
      setName('');
      setColorTouched(false);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const visibleGroups = groups.filter((g) => g.items.length > 0);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card" aria-label={title}>
      <header className="flex items-center gap-2 px-5 pb-3 pt-4">
        {icon && <span className="text-fg-faint [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">· {total}</span>
      </header>

      <form onSubmit={submit} className="flex items-center gap-2 px-5 pb-4">
        <ColorDotPicker
          value={color}
          onChange={(c) => { setColor(c); setColorTouched(true); }}
          label={`Colour for the new ${noun}`}
          className="h-5 w-5"
        />
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`New ${noun} name`}
          aria-label={`New ${noun} name`}
          className="h-9 flex-1"
        />
        <Button type="submit" variant="outline" size="sm" className="h-9 gap-1.5" disabled={!name.trim() || pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
      </form>

      <div className="border-t border-hairline">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-fg-faint" /></div>
        ) : visibleGroups.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          visibleGroups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <div key={group.key} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-2 px-5 pb-1.5 pt-3 text-left"
                >
                  <Eyebrow className="truncate">{group.label}</Eyebrow>
                  {group.note && <span className="text-[11px] text-fg-faint">· {group.note}</span>}
                  <span className="ml-auto text-[11px] tabular-nums text-fg-faint">{group.items.length}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-fg-faint transition-transform', isCollapsed && '-rotate-90')} />
                </button>
                {!isCollapsed && (
                  <ul className="divide-y divide-hairline pb-1">
                    {group.items.map((item) => (
                      <TaxonomyRow key={item.id} item={item} noun={noun} onUpdate={onUpdate} onDelete={onDelete} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function TaxonomyRow({
  item,
  noun,
  onUpdate,
  onDelete,
}: {
  item: TaxonomyItem;
  noun: string;
  onUpdate: (item: TaxonomyItem, patch: Partial<TaxonomyItem>) => void;
  onDelete: (item: TaxonomyItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEdit = () => {
    setDraft(item.name);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== item.name) onUpdate(item, { name: trimmed });
  };

  return (
    <li className={cn('group flex h-11 items-center gap-3 px-5', !item.is_active && 'opacity-60')}>
      <ColorDotPicker value={item.color} onChange={(c) => onUpdate(item, { color: c })} label={`Colour of ${item.name}`} />
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
            }}
            aria-label={`Rename ${noun}`}
            className="h-8 flex-1"
          />
          <span className="hidden text-[11px] text-fg-faint sm:inline">Enter saves · Esc cancels</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="min-w-0 flex-1 truncate rounded text-left text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title="Click to rename"
        >
          {item.name}
          {!item.is_active && <span className="ml-2 text-xs text-fg-faint">Inactive</span>}
        </button>
      )}
      <Switch
        checked={item.is_active}
        onCheckedChange={(checked) => onUpdate(item, { is_active: checked })}
        aria-label={`${item.name} active`}
        className="scale-90"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-fg-faint opacity-60 group-hover:opacity-100 data-[state=open]:opacity-100" aria-label={`More actions for ${item.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={startEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onUpdate(item, { is_active: !item.is_active })}>
            <Power className="mr-2 h-3.5 w-3.5" /> {item.is_active ? 'Deactivate' : 'Activate'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onDelete(item)} className="text-danger focus:text-danger">
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
