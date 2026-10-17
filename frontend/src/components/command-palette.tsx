import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from './auth-provider';
import { buildPaletteItems, moveIndex, type PaletteCommand, type SearchHit } from '@/lib/command-palette';
import { TOGGLE_VIEW_EVENT, emitAppEvent } from '@/lib/app-events';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTask: () => void;
  onShowHelp: () => void;
}

const nav = (id: string, title: string, to: string, keywords?: string[]): PaletteCommand => ({
  id: `nav-${id}`, title, section: 'Navigate', keywords, run: { type: 'navigate', to },
});

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

export default function CommandPalette({ open, onOpenChange, onCreateTask, onShowHelp }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const searchEnabled = open && debounced.length >= MIN_QUERY;
  const { data: hits, isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: async ({ signal }) => {
      // params: lets axios encode the query (a raw `&`, `#` or `%` would break the URL)
      const res = await api.get<SearchHit[]>('/search/', { params: { q: debounced }, signal });
      return res.data;
    },
    enabled: searchEnabled,
    staleTime: 30_000,
  });

  const commands = useMemo<PaletteCommand[]>(() => [
    { id: 'act-new-task', title: 'New task', section: 'Actions', keywords: ['create', 'add'], hint: 'c', run: { type: 'create-task' } },
    { id: 'act-new-project', title: 'New project', section: 'Actions', keywords: ['create', 'add'], run: { type: 'navigate', to: '/projects?create=true' } },
    { id: 'act-toggle-view', title: 'Toggle list / board view', section: 'Actions', keywords: ['kanban', 'board', 'list', 'layout'], run: { type: 'event', name: TOGGLE_VIEW_EVENT } },
    { id: 'act-help', title: 'Keyboard shortcuts', section: 'Actions', keywords: ['help', 'keys'], hint: '?', run: { type: 'help' } },
    nav('dashboard', 'Dashboard', '/', ['home', 'overview']),
    nav('updates', 'Updates', '/updates', ['recap']),
    nav('notifications', 'Notifications', '/notifications', ['inbox', 'bell', 'unread', 'email preferences']),
    nav('projects', 'Projects', '/projects'),
    nav('tasks', 'My tasks', '/tasks', ['assigned']),
    nav('ideas', 'Ideas', '/ideas'),
    nav('schedule', 'Schedule', '/schedule', ['calendar', 'roadmap']),
    nav('archive', 'Archive', '/archive'),
    nav('templates', 'Templates', '/templates'),
    nav('workflows', 'Workflows', '/workflows'),
    nav('teams', 'Teams', '/teams'),
    nav('settings', 'Settings', '/settings', ['profile', 'account']),
    ...(user?.is_superuser ? [nav('users', 'Team members', '/users', ['admin']), nav('metadata', 'Metadata', '/admin/metadata', ['admin', 'topics', 'types'])] : []),
  ], [user?.is_superuser]);

  // server hits are only shown for the query they were fetched with, never stale ones from a previous keystroke
  const currentHits = searchEnabled && debounced === query.trim() ? hits ?? [] : [];
  const items = useMemo(() => buildPaletteItems(commands, currentHits, query), [commands, currentHits, query]);
  const activeIndex = items.length ? Math.min(active, items.length - 1) : -1;

  useEffect(() => {
    document.getElementById(`palette-opt-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  const close = () => {
    onOpenChange(false);
    setQuery('');
    setDebounced('');
    setActive(0);
  };

  const run = (cmd: PaletteCommand) => {
    close();
    switch (cmd.run.type) {
      case 'navigate': navigate(cmd.run.to); break;
      case 'event': emitAppEvent(cmd.run.name); break;
      case 'create-task': onCreateTask(); break;
      case 'help': onShowHelp(); break;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(moveIndex(activeIndex, e.key === 'ArrowDown' ? 1 : -1, items.length));
    } else if (e.key === 'Home' && items.length) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && items.length) {
      e.preventDefault();
      setActive(items.length - 1);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      run(items[activeIndex]);
    }
  };

  const searching = searchEnabled && (isFetching || debounced !== query.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages, projects and tasks, or run an action. Use the arrow keys to move and Enter to select.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b border-slate-200 px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-label="Search or run a command"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `palette-opt-${activeIndex}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search projects, tasks, or type a command..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Esc</kbd>
        </div>

        <div ref={listRef} id="palette-listbox" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
          {items.map((cmd, i) => (
            <Fragment key={cmd.id}>
              {(i === 0 || items[i - 1].section !== cmd.section) && (
                <div role="presentation" className="px-2 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {cmd.section}
                </div>
              )}
              <div
                id={`palette-opt-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
                  i === activeIndex ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50',
                )}
                onMouseMove={() => i !== activeIndex && setActive(i)}
                onClick={() => run(cmd)}
              >
                <span className="flex-1 truncate">{cmd.title}</span>
                {cmd.hint && (
                  <span className="rounded border border-slate-200 px-1.5 text-[10px] font-semibold uppercase text-slate-400">{cmd.hint}</span>
                )}
                {i === activeIndex && <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden />}
              </div>
            </Fragment>
          ))}
          {items.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-400">
              {searching ? 'Searching...' : `No results for "${query.trim()}"`}
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400" role="status" aria-live="polite">
          {searching ? 'Searching projects and tasks...' : 'Type 2+ characters to search projects, tasks and ideas'}
        </div>
      </DialogContent>
    </Dialog>
  );
}
