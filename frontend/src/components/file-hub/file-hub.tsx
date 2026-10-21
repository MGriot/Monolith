import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileStack,
  Folder as FolderIcon,
  FolderPlus,
  Home,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  PenTool,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eyebrow } from '@/components/ui/section';
import { EmptyState } from '@/components/ui/empty-state';
import { RichDropdown } from '@/components/ui/rich-dropdown';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import NoteEditor from '@/components/note-editor';
import { confirmDialog } from '@/lib/confirm';
import { clickSelection, EMPTY_SELECTION, pruneSelection, type SelectionState } from '@/lib/selection';
import {
  canMoveFolder,
  countFiles,
  fileKind,
  filesForView,
  filesToMove,
  folderPath,
  formatBytes,
  indexFolders,
  kindCounts,
  KIND_LABELS,
  type FileKind,
  type HubFile,
  type HubFolder,
  type HubView,
  type SortKey,
} from '@/lib/file-hub';
import { useUploadQueue } from '@/hooks/use-upload-queue';
import { SketchThumbnail } from '@/components/sketch-thumbnail';
import { DropNavItem, FileCard, FileThumbnail, FolderCard, InlineName, KindIcon, TreeNode, UploadTray, type NativeDropProps } from './parts';
import type { Topic } from '@/types';

type ViewState = HubView | { type: 'sketches' };

interface Whiteboard { id: string; title: string; preview_image?: string | null; updated_at?: string; created_at?: string }

const INBOX_NAME = 'Uploads';
const VIEW_KEY = 'monolith:file-hub-view';

const readViewMode = (): 'grid' | 'list' => {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
};

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

interface FileHubProps {
  projectId: string;
  /** opens the full-screen preview for uploaded files */
  onOpenFile: (file: HubFile) => void;
}

/**
 * Project file manager: folders and smart views on the left, files as cards in the middle, a preview on the right.
 * Files dropped from the desktop upload into the folder under the pointer; cards drag onto folders to move and onto
 * topics to tag.
 */
export default function FileHub({ projectId, onOpenFile }: FileHubProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>({ type: 'folder', id: null });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('modified');
  const [mode, setMode] = useState<'grid' | 'list'>(readViewMode);
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [nativeTarget, setNativeTarget] = useState<string | null>(null);
  const [paneOver, setPaneOver] = useState(false);
  const [dragging, setDragging] = useState<{ kind: 'file' | 'folder'; ids: string[]; label: string } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamingFile, setRenamingFile] = useState(false);
  const [noteFile, setNoteFile] = useState<HubFile | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const pendingUploadTarget = useRef<{ id: string; name: string } | null>(null);
  const paneDepth = useRef(0);

  const { data: folders, isLoading } = useQuery({
    queryKey: ['folders', { projectId, taskId: undefined }],
    queryFn: async () => (await api.get(`/folders/?project_id=${projectId}`)).data as HubFolder[],
  });

  const { data: topics } = useQuery({
    queryKey: ['metadata', 'topics', projectId],
    queryFn: async () => (await api.get('/metadata/topics', { params: { project_id: projectId, include_global: true } })).data as Topic[],
  });

  const { data: whiteboards } = useQuery({
    queryKey: ['whiteboards', projectId],
    queryFn: async () => (await api.get(`/whiteboards/?project_id=${projectId}`)).data as Whiteboard[],
  });

  const index = useMemo(() => indexFolders(folders || []), [folders]);
  const activeTopics = useMemo(() => (topics || []).filter(t => t.is_active), [topics]);
  const counts = useMemo(() => kindCounts(index.files), [index]);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['folders'] }), [queryClient]);

  const currentFolderId = view.type === 'folder' ? view.id : null;
  const currentFolder = currentFolderId ? index.byId.get(currentFolderId) : undefined;
  const path = folderPath(index, currentFolderId);
  const searching = search.trim() !== '';
  const subfolders = view.type === 'folder' && !searching ? index.children.get(currentFolderId) ?? [] : [];
  const files = useMemo(() => (view.type === 'sketches' ? [] : filesForView(index, view, search, sort)), [index, view, search, sort]);
  const order = useMemo(() => files.map(f => f.id), [files]);
  const selectedFiles = files.filter(f => selection.selected.has(f.id));
  const single = selectedFiles.length === 1 ? selectedFiles[0] : null;
  const showFolderName = view.type !== 'folder' || searching;

  // Keep the selection to what is on screen.
  useEffect(() => { setSelection(s => pruneSelection(s, order)); }, [order]);

  // A deep folder opened from the breadcrumb or a card shows expanded in the tree.
  useEffect(() => {
    if (!currentFolderId) return;
    setExpanded(prev => {
      const ids = folderPath(index, currentFolderId).slice(0, -1).map(f => f.id);
      if (ids.every(id => prev.has(id))) return prev;
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }, [currentFolderId, index]);

  const setViewMode = (m: 'grid' | 'list') => {
    setMode(m);
    try { localStorage.setItem(VIEW_KEY, m); } catch { /* per-viewer convenience only */ }
  };

  const openView = (v: ViewState) => {
    setView(v);
    setSearch('');
    setSelection(EMPTY_SELECTION);
    setFocusId(null);
  };

  const toggleExpanded = useCallback((id: string, open?: boolean) => {
    setExpanded(prev => {
      const next = new Set(prev);
      const shouldOpen = open ?? !next.has(id);
      if (shouldOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // ------------------------------------------------------------------ uploads
  const uploads = useUploadQueue(useCallback(() => { void refresh(); }, [refresh]));

  /** Uploads outside a folder land in a top-level "Uploads" folder, created on first use. */
  const ensureInbox = async (): Promise<{ id: string; name: string }> => {
    const existing = (index.children.get(null) ?? []).find(f => f.name.toLowerCase() === INBOX_NAME.toLowerCase());
    if (existing) return { id: existing.id, name: existing.name };
    const res = await api.post('/folders/', { name: INBOX_NAME, project_id: projectId });
    await refresh();
    return { id: res.data.id, name: INBOX_NAME };
  };

  const uploadTarget = (): { id: string; name: string } | null => currentFolder ? { id: currentFolder.id, name: currentFolder.name } : null;

  const uploadTo = async (list: File[], target: { id: string; name: string } | null) => {
    if (!list.length) return;
    try {
      const t = target ?? (await ensureInbox());
      uploads.enqueue(list, t.id, t.name);
    } catch {
      toast.error('Could not prepare the upload folder');
    }
  };

  const pickFiles = (target: { id: string; name: string } | null) => {
    pendingUploadTarget.current = target;
    fileInput.current?.click();
  };

  /** Desktop-file drop handlers for one folder (cards and tree rows). */
  const nativeDropFor = useCallback((id: string, name: string): NativeDropProps => ({
    onDragOver: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setNativeTarget(id);
    },
    onDragLeave: (e) => {
      if (!hasFiles(e)) return;
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setNativeTarget(t => (t === id ? null : t));
    },
    onDrop: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setNativeTarget(null);
      setPaneOver(false);
      paneDepth.current = 0;
      void uploadTo(Array.from(e.dataTransfer.files), { id, name });
    },
    // uploadTo closes over the latest index through ensureInbox; ids are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [index]);

  const paneDrop = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      paneDepth.current += 1;
      setPaneOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      paneDepth.current = Math.max(0, paneDepth.current - 1);
      if (paneDepth.current === 0) { setPaneOver(false); setNativeTarget(null); }
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      paneDepth.current = 0;
      setPaneOver(false);
      setNativeTarget(null);
      void uploadTo(Array.from(e.dataTransfer.files), uploadTarget());
    },
  };

  // ------------------------------------------------------------------ mutations
  const errorText = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

  const moveFiles = async (list: HubFile[], targetId: string, opts: { undo?: boolean } = {}) => {
    const moving = filesToMove(list, targetId);
    if (!moving.length) return;
    const target = index.byId.get(targetId);
    const results = await Promise.allSettled(moving.map(f => api.put(`/folders/files/${f.id}`, { folder_id: targetId })));
    await refresh();
    const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    const moved = moving.filter((_, i) => results[i].status === 'fulfilled');
    if (failed.length) toast.error(`${failed.length} file${failed.length === 1 ? '' : 's'} not moved: ${errorText(failed[0].reason, 'not allowed')}`);
    if (moved.length && !opts.undo) {
      toast.success(`Moved ${moved.length === 1 ? `“${moved[0].name}”` : `${moved.length} files`} to ${target?.name ?? 'folder'}`, {
        action: {
          label: 'Undo',
          onClick: () => {
            const byFolder = new Map<string, HubFile[]>();
            moved.forEach(f => byFolder.set(f.folder_id, [...(byFolder.get(f.folder_id) ?? []), { ...f, folder_id: targetId }]));
            byFolder.forEach((group, original) => void moveFiles(group, original, { undo: true }));
          },
        },
      });
    }
  };

  const moveFolder = async (folderId: string, targetId: string | null) => {
    const folder = index.byId.get(folderId);
    if (!folder || !canMoveFolder(index, folderId, targetId)) return;
    const previous = folder.parent_id;
    try {
      await api.put(`/folders/${folderId}`, { parent_id: targetId });
      await refresh();
      toast.success(`Moved “${folder.name}” to ${targetId ? index.byId.get(targetId)?.name : 'the top level'}`, {
        action: { label: 'Undo', onClick: () => { void api.put(`/folders/${folderId}`, { parent_id: previous }).then(refresh); } },
      });
    } catch (err) {
      toast.error(errorText(err, 'Could not move the folder'));
    }
  };

  const setFileTopics = async (file: HubFile, topicIds: string[]) => {
    try {
      await api.put(`/folders/files/${file.id}`, { topic_ids: topicIds });
      await refresh();
    } catch (err) {
      toast.error(errorText(err, 'Could not change the topics'));
    }
  };

  const tagFiles = async (list: HubFile[], topic: Topic) => {
    const todo = list.filter(f => !f.topics?.some(t => t.id === topic.id));
    if (!todo.length) return;
    const results = await Promise.allSettled(todo.map(f => api.put(`/folders/files/${f.id}`, { topic_ids: [...(f.topics ?? []).map(t => t.id), topic.id] })));
    await refresh();
    const ok = results.filter(r => r.status === 'fulfilled').length;
    if (ok) toast.success(`Tagged ${ok === 1 ? `“${todo[0].name}”` : `${ok} files`} with ${topic.name}`);
    if (ok < todo.length) toast.error('Some files could not be tagged');
  };

  const deleteFiles = async (list: HubFile[]) => {
    if (!list.length) return;
    const ok = await confirmDialog({
      title: list.length === 1 ? `Delete “${list[0].name}”?` : `Delete ${list.length} files?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    const results = await Promise.allSettled(list.map(f => api.delete(`/folders/files/${f.id}`)));
    await refresh();
    const failed = results.filter(r => r.status === 'rejected').length;
    setSelection(EMPTY_SELECTION);
    if (failed) toast.error(`${failed} file${failed === 1 ? '' : 's'} could not be deleted`);
    else toast.success(list.length === 1 ? 'File deleted' : `${list.length} files deleted`);
  };

  const renameFile = async (file: HubFile, name: string) => {
    setRenamingFile(false);
    try {
      await api.put(`/folders/files/${file.id}`, { name });
      await refresh();
    } catch (err) {
      toast.error(errorText(err, 'Could not rename the file'));
    }
  };

  const createFolder = async () => {
    try {
      const res = await api.post('/folders/', { name: 'New folder', project_id: projectId, parent_id: currentFolderId });
      await refresh();
      if (view.type !== 'folder') setView({ type: 'folder', id: currentFolderId });
      setRenamingFolder(res.data.id);
    } catch (err) {
      toast.error(errorText(err, 'Could not create the folder'));
    }
  };

  const renameFolder = async (id: string, name: string) => {
    setRenamingFolder(null);
    try {
      await api.put(`/folders/${id}`, { name });
      await refresh();
    } catch (err) {
      toast.error(errorText(err, 'Could not rename the folder'));
    }
  };

  const deleteFolder = async (folder: HubFolder) => {
    const n = countFiles(index, folder.id);
    const ok = await confirmDialog({
      title: `Delete the folder “${folder.name}”?`,
      description: n ? `Its ${n} file${n === 1 ? '' : 's'} and subfolders are deleted too.` : 'Its subfolders are deleted too.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/folders/${folder.id}`);
      if (currentFolderId && (currentFolderId === folder.id || folderPath(index, currentFolderId).some(f => f.id === folder.id))) {
        setView({ type: 'folder', id: folder.parent_id });
      }
      await refresh();
      toast.success('Folder deleted');
    } catch (err) {
      toast.error(errorText(err, 'Could not delete the folder'));
    }
  };

  const createNote = async () => {
    try {
      const target = uploadTarget() ?? (await ensureInbox());
      const res = await api.post(`/folders/${target.id}/upload-note`, { name: 'Untitled note.md' });
      await refresh();
      setNoteFile(res.data);
    } catch (err) {
      toast.error(errorText(err, 'Could not create the note'));
    }
  };

  const openFile = (file: HubFile) => {
    if (fileKind(file) === 'note' || file.url.startsWith('note://')) setNoteFile(file);
    else onOpenFile(file);
  };

  // ------------------------------------------------------------------ selection + keyboard
  const onCardClick = (file: HubFile, e: React.MouseEvent) => {
    paneRef.current?.focus({ preventScroll: true });
    setFocusId(file.id);
    if (e.shiftKey) setSelection(s => clickSelection(s.selected.size ? s : { selected: new Set(), anchor: file.id }, order, file.id, true));
    else if (e.ctrlKey || e.metaKey) setSelection(s => clickSelection(s, order, file.id, false));
    else setSelection({ selected: new Set([file.id]), anchor: file.id });
  };

  const columns = () => {
    const grid = paneRef.current?.querySelector('[data-file-grid]') as HTMLElement | null;
    if (!grid || mode === 'list') return 1;
    return getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  };

  const onPaneKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
    const at = focusId ? order.indexOf(focusId) : -1;
    const move = (delta: number) => {
      if (!order.length) return;
      const next = order[Math.max(0, Math.min(order.length - 1, at === -1 ? 0 : at + delta))];
      setFocusId(next);
      if (e.shiftKey) setSelection(s => clickSelection(s, order, next, true));
      else setSelection({ selected: new Set([next]), anchor: next });
    };
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); move(1); break;
      case 'ArrowLeft': e.preventDefault(); move(-1); break;
      case 'ArrowDown': e.preventDefault(); move(columns()); break;
      case 'ArrowUp': e.preventDefault(); move(-columns()); break;
      case 'Enter': if (single) { e.preventDefault(); openFile(single); } break;
      case 'F2': if (single) { e.preventDefault(); setRenamingFile(true); } break;
      case 'Delete': case 'Backspace': if (selectedFiles.length) { e.preventDefault(); void deleteFiles(selectedFiles); } break;
      case 'Escape': setSelection(EMPTY_SELECTION); setFocusId(null); break;
      case 'a': if (e.ctrlKey || e.metaKey) { e.preventDefault(); setSelection({ selected: new Set(order), anchor: null }); } break;
    }
  };

  // ------------------------------------------------------------------ drag and drop between folders
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } })
  );

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { kind: 'file' | 'folder'; id: string };
    if (data.kind === 'folder') {
      setDragging({ kind: 'folder', ids: [data.id], label: index.byId.get(data.id)?.name ?? 'Folder' });
      return;
    }
    // Dragging a selected card carries the whole selection.
    const ids = selection.selected.has(data.id) ? order.filter(id => selection.selected.has(id)) : [data.id];
    if (!selection.selected.has(data.id)) setSelection({ selected: new Set([data.id]), anchor: data.id });
    const first = index.files.find(f => f.id === ids[0]);
    setDragging({ kind: 'file', ids, label: ids.length === 1 ? first?.name ?? 'File' : `${ids.length} files` });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const current = dragging;
    setDragging(null);
    if (!current || !e.over) return;
    const target = e.over.data.current as { kind: string; id: string | null };
    if (current.kind === 'folder') {
      if (target.kind === 'folder-target' || target.kind === 'root') void moveFolder(current.ids[0], target.id);
      return;
    }
    const list = index.files.filter(f => current.ids.includes(f.id));
    if (target.kind === 'folder-target' && target.id) void moveFiles(list, target.id);
    if (target.kind === 'topic') {
      const topic = activeTopics.find(t => t.id === target.id);
      if (topic) void tagFiles(list, topic);
    }
  };

  // ------------------------------------------------------------------ render
  const viewTitle =
    searching ? `Results for “${search.trim()}”`
      : view.type === 'folder' ? (currentFolder?.name ?? 'Files')
        : view.type === 'all' ? 'All files'
          : view.type === 'recent' ? 'Recent'
            : view.type === 'kind' ? KIND_LABELS[view.kind]
              : view.type === 'topic' ? (activeTopics.find(t => t.id === view.id)?.name ?? 'Topic')
                : 'Sketches';

  const dropLabel = nativeTarget
    ? index.byId.get(nativeTarget)?.name
    : currentFolder?.name ?? INBOX_NAME;

  const kindsShown = (Object.keys(KIND_LABELS) as FileKind[]).filter(k => counts[k]);
  const isActive = (v: ViewState) => JSON.stringify(v) === JSON.stringify(view);

  const folderMenu = (folder: HubFolder) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-fg-faint opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100" aria-label={`Actions for ${folder.name}`} onPointerDown={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => openView({ type: 'folder', id: folder.id })}><FolderIcon className="mr-2 h-3.5 w-3.5" /> Open</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pickFiles({ id: folder.id, name: folder.name })}><Upload className="mr-2 h-3.5 w-3.5" /> Upload here</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setRenamingFolder(folder.id)}><Pencil className="mr-2 h-3.5 w-3.5" /> Rename</DropdownMenuItem>
        {folder.parent_id && (
          <DropdownMenuItem onSelect={() => void moveFolder(folder.id, null)}><Home className="mr-2 h-3.5 w-3.5" /> Move to top level</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void deleteFolder(folder)} className="text-danger focus:text-danger"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-xl border bg-card">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <nav aria-label="Folder path" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
            <Crumb id="root" active={view.type === 'folder' && !currentFolderId} onClick={() => openView({ type: 'folder', id: null })} label="Files" folderId={null} />
            {view.type === 'folder' && path.map(f => (
              <span key={f.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-ghost" />
                <Crumb id={`crumb:${f.id}`} active={f.id === currentFolderId} onClick={() => openView({ type: 'folder', id: f.id })} label={f.name} folderId={f.id} />
              </span>
            ))}
            {view.type !== 'folder' && (
              <span className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-ghost" />
                <span className="truncate font-medium">{viewTitle}</span>
              </span>
            )}
          </nav>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" aria-label="Search files" className="h-8 pl-8 text-sm" />
          </div>
          <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
            <option value="modified">Last modified</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
          <div className="inline-flex rounded-md border bg-subtle p-0.5" role="radiogroup" aria-label="Layout">
            {(['grid', 'list'] as const).map(m => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} aria-label={m === 'grid' ? 'Grid' : 'List'} onClick={() => setViewMode(m)}
                className={cn('flex h-7 w-7 items-center justify-center rounded', mode === m ? 'bg-background text-foreground shadow-sm' : 'text-fg-faint hover:text-foreground')}>
                {m === 'grid' ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5"><Plus className="h-3.5 w-3.5" /> New</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => void createFolder()}><FolderPlus className="mr-2 h-3.5 w-3.5" /> Folder</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void createNote()}><NotebookPen className="mr-2 h-3.5 w-3.5" /> Note</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate(`/projects/${projectId}/whiteboards/new`)}><PenTool className="mr-2 h-3.5 w-3.5" /> Sketch</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => pickFiles(uploadTarget())}><Upload className="h-3.5 w-3.5" /> Upload</Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void uploadTo(Array.from(e.target.files ?? []), pendingUploadTarget.current);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <aside className="hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r px-2 py-3 md:flex" aria-label="Places">
            <div className="space-y-0.5">
              <NavButton active={isActive({ type: 'all' })} onClick={() => openView({ type: 'all' })} icon={<FileStack className="h-4 w-4" />} label="All files" count={index.files.length} />
              <NavButton active={isActive({ type: 'recent' })} onClick={() => openView({ type: 'recent' })} icon={<Clock className="h-4 w-4" />} label="Recent" />
              <NavButton active={isActive({ type: 'sketches' })} onClick={() => openView({ type: 'sketches' })} icon={<PenTool className="h-4 w-4" />} label="Sketches" count={whiteboards?.length} />
            </div>

            {kindsShown.length > 0 && (
              <div className="space-y-0.5">
                <Eyebrow className="block px-2 pb-1">Types</Eyebrow>
                {kindsShown.map(k => (
                  <NavButton key={k} active={isActive({ type: 'kind', kind: k })} onClick={() => openView({ type: 'kind', kind: k })} icon={<KindIcon kind={k} className="h-4 w-4" />} label={KIND_LABELS[k]} count={counts[k]} />
                ))}
              </div>
            )}

            <div className="space-y-0.5">
              <Eyebrow className="block px-2 pb-1">Folders</Eyebrow>
              <DropNavItem
                id="root-target"
                data={{ kind: 'root', id: null }}
                active={view.type === 'folder' && !currentFolderId}
                icon={<Home className="h-4 w-4 text-fg-faint" />}
                label="Top level"
                overLabel="Move here"
                onClick={() => openView({ type: 'folder', id: null })}
              />
              <ul>
                {(index.children.get(null) ?? []).map(f => (
                  <TreeNode
                    key={f.id}
                    index={index}
                    folder={f}
                    depth={0}
                    activeId={view.type === 'folder' ? currentFolderId : null}
                    expanded={expanded}
                    dragging={!!dragging}
                    nativeTarget={nativeTarget}
                    nativeDropFor={nativeDropFor}
                    onToggle={toggleExpanded}
                    onOpen={(id) => openView({ type: 'folder', id })}
                  />
                ))}
              </ul>
            </div>

            {activeTopics.length > 0 && (
              <div className="space-y-0.5">
                <Eyebrow className="block px-2 pb-1">Topics</Eyebrow>
                {activeTopics.map(t => (
                  <DropNavItem
                    key={t.id}
                    id={`topic:${t.id}`}
                    data={{ kind: 'topic', id: t.id }}
                    active={isActive({ type: 'topic', id: t.id })}
                    icon={<span className="ml-1 mr-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                    label={t.name}
                    count={index.files.filter(f => f.topics?.some(x => x.id === t.id)).length || undefined}
                    overLabel="Tag"
                    onClick={() => openView({ type: 'topic', id: t.id })}
                  />
                ))}
              </div>
            )}
          </aside>

          {/* Main pane */}
          <div
            ref={paneRef}
            tabIndex={0}
            role="listbox"
            aria-multiselectable
            aria-label={viewTitle}
            onKeyDown={onPaneKeyDown}
            onClick={(e) => { if (e.target === e.currentTarget) setSelection(EMPTY_SELECTION); }}
            {...paneDrop}
            className="relative min-w-0 flex-1 overflow-y-auto p-3 outline-none sm:p-4"
          >
            {isLoading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-fg-faint" /></div>
            ) : view.type === 'sketches' ? (
              <SketchGrid projectId={projectId} whiteboards={whiteboards || []} />
            ) : (
              <div className="space-y-5" onClick={(e) => { if (e.target === e.currentTarget) setSelection(EMPTY_SELECTION); }}>
                {subfolders.length > 0 && (
                  <section className="space-y-2">
                    <Eyebrow>Folders</Eyebrow>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2.5">
                      {subfolders.map(f => (
                        <FolderCard
                          key={f.id}
                          folder={f}
                          fileCount={countFiles(index, f.id)}
                          nativeOver={nativeTarget === f.id}
                          nativeDrop={nativeDropFor(f.id, f.name)}
                          renaming={renamingFolder === f.id}
                          onOpen={() => openView({ type: 'folder', id: f.id })}
                          onRename={(name) => void renameFolder(f.id, name)}
                          onCancelRename={() => setRenamingFolder(null)}
                          menu={folderMenu(f)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {files.length > 0 ? (
                  <section className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Eyebrow>{subfolders.length ? 'Files' : viewTitle}</Eyebrow>
                      <span className="text-xs tabular-nums text-fg-faint">{files.length}</span>
                      {selectedFiles.length > 1 && <span className="text-xs text-fg-soft">· {selectedFiles.length} selected</span>}
                    </div>
                    <div
                      data-file-grid
                      className={mode === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3' : 'space-y-0.5'}
                    >
                      {files.map(f => (
                        <FileCard
                          key={f.id}
                          file={f}
                          view={mode}
                          selected={selection.selected.has(f.id)}
                          focused={focusId === f.id}
                          folderName={showFolderName ? index.byId.get(f.folder_id)?.name : undefined}
                          onSelect={(e) => onCardClick(f, e)}
                          onOpen={() => openFile(f)}
                        />
                      ))}
                    </div>
                  </section>
                ) : (
                  !subfolders.length ? (
                    <EmptyState
                      icon={searching ? <Search /> : <Upload />}
                      title={searching ? 'No files match' : view.type === 'folder' ? (currentFolderId ? 'This folder is empty' : 'No folders yet') : 'Nothing here yet'}
                      text={searching ? 'Try another name.' : 'Drop files anywhere here to upload them, or use the buttons.'}
                      action={!searching && (
                        <div className="flex flex-wrap justify-center gap-2">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => pickFiles(uploadTarget())}><Upload className="h-3.5 w-3.5" /> Upload files</Button>
                          {view.type === 'folder' && <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void createFolder()}><FolderPlus className="h-3.5 w-3.5" /> New folder</Button>}
                        </div>
                      )}
                      className="min-h-[240px]"
                    />
                  ) : null
                )}
              </div>
            )}

            {paneOver && view.type !== 'sketches' && (
              <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-info bg-info-soft/80 backdrop-blur-[1px]">
                <div className="flex items-center gap-3 rounded-lg bg-background px-4 py-3 text-sm font-medium text-info shadow-lg">
                  <Upload className="h-5 w-5" />
                  Drop to upload to {dropLabel}
                </div>
              </div>
            )}

            <UploadTray items={uploads.items} onCancel={uploads.cancel} onRetry={uploads.retry} onClear={uploads.clearFinished} />
          </div>

          {/* Preview */}
          {single && (
            <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l p-4 lg:flex" aria-label="File details">
              <div className="flex items-start justify-between gap-2">
                <Eyebrow>Details</Eyebrow>
                <button type="button" onClick={() => setSelection(EMPTY_SELECTION)} className="rounded p-0.5 text-fg-faint hover:text-foreground" aria-label="Close details"><X className="h-3.5 w-3.5" /></button>
              </div>
              <button type="button" onClick={() => openFile(single)} className="block rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <FileThumbnail file={single} large className="aspect-[4/3] w-full" />
              </button>
              {renamingFile ? (
                <InlineName initial={single.name} onSubmit={(n) => void renameFile(single, n)} onCancel={() => setRenamingFile(false)} />
              ) : (
                <button type="button" onClick={() => setRenamingFile(true)} className="break-words text-left text-sm font-semibold hover:underline" title="Rename (F2)">{single.name}</button>
              )}
              <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs">
                <dt className="text-fg-faint">Type</dt><dd>{KIND_LABELS[fileKind(single)].replace(/s$/, '')}</dd>
                {single.size_bytes ? (<><dt className="text-fg-faint">Size</dt><dd className="tabular-nums">{formatBytes(single.size_bytes)}</dd></>) : null}
                <dt className="text-fg-faint">Added</dt><dd>{new Date(single.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
                <dt className="text-fg-faint">Folder</dt>
                <dd className="truncate">
                  <button type="button" className="hover:underline" onClick={() => openView({ type: 'folder', id: single.folder_id })}>
                    {folderPath(index, single.folder_id).map(f => f.name).join(' › ') || '—'}
                  </button>
                </dd>
              </dl>
              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Tag className="h-3 w-3" /> Topics</span>
                <RichDropdown
                  items={activeTopics.map(t => ({ id: t.id, label: t.name, color: t.color }))}
                  selectedValues={(single.topics ?? []).map(t => t.id)}
                  onSelect={(id) => void setFileTopics(single, [...(single.topics ?? []).map(t => t.id).filter(x => x !== id), ...((single.topics ?? []).some(t => t.id === id) ? [] : [id])])}
                  onRemove={(id) => void setFileTopics(single, (single.topics ?? []).map(t => t.id).filter(x => x !== id))}
                  multi
                  placeholder="Add topics…"
                  searchPlaceholder="Search topics…"
                />
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => openFile(single)}><ExternalLink className="h-3.5 w-3.5" /> Open</Button>
                {!single.url.startsWith('note://') && (
                  <Button size="sm" variant="outline" className="gap-1.5" asChild>
                    <a href={single.url} download={single.name}><Download className="h-3.5 w-3.5" /> Download</a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="gap-1.5 text-danger hover:bg-danger-soft hover:text-danger" onClick={() => void deleteFiles([single])}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
              </div>
            </aside>
          )}
        </div>

        {/* Bulk bar */}
        {selectedFiles.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 border-t bg-subtle/60 px-4 py-2 text-sm">
            <span className="font-medium">{selectedFiles.length} selected</span>
            <span className="text-xs text-fg-faint">Drag them onto a folder to move, or onto a topic to tag.</span>
            <div className="ml-auto flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="outline">Move to…</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
                  {[...index.byId.values()].sort((a, b) => folderPath(index, a.id).map(f => f.name).join('/').localeCompare(folderPath(index, b.id).map(f => f.name).join('/'))).map(f => (
                    <DropdownMenuItem key={f.id} onSelect={() => void moveFiles(selectedFiles, f.id)}>
                      <span className="truncate">{folderPath(index, f.id).map(x => x.name).join(' › ')}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => void deleteFiles(selectedFiles)}>Delete</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelection(EMPTY_SELECTION)}>Clear</Button>
            </div>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="pointer-events-none flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background shadow-xl">
            {dragging.kind === 'folder' ? <FolderIcon className="h-4 w-4" /> : <FileStack className="h-4 w-4" />}
            <span className="max-w-[14rem] truncate">{dragging.label}</span>
          </div>
        )}
      </DragOverlay>

      <Dialog open={!!noteFile} onOpenChange={(o) => { if (!o) setNoteFile(null); }}>
        <DialogContent size="full">
          {noteFile && <NoteEditor file={{ ...noteFile, content: noteFile.content ?? undefined }} onClose={() => setNoteFile(null)} />}
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

function NavButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors',
        active ? 'bg-muted font-medium text-foreground' : 'text-fg-soft hover:bg-subtle hover:text-foreground'
      )}
    >
      <span className="text-fg-faint">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && <span className="text-xs tabular-nums text-fg-faint">{count}</span>}
    </button>
  );
}

/** Breadcrumb entry; also a drop target so a file can move up the path. */
function Crumb({ id, active, onClick, label, folderId }: { id: string; active: boolean; onClick: () => void; label: string; folderId: string | null }) {
  return (
    <DropCrumb id={id} folderId={folderId}>
      {(over) => (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'max-w-[12rem] truncate rounded px-1.5 py-0.5 transition-colors',
            over ? 'bg-info-soft text-info ring-1 ring-info' : active ? 'font-medium text-foreground' : 'text-fg-soft hover:bg-subtle hover:text-foreground'
          )}
        >
          {label}
        </button>
      )}
    </DropCrumb>
  );
}

/** Crumbs drop into their folder; the root crumb drops to the top level. */
function DropCrumb({ id, folderId, children }: { id: string; folderId: string | null; children: (over: boolean) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: folderId ? { kind: 'folder-target', id: folderId } : { kind: 'root', id: null } });
  return <span ref={setNodeRef} className="min-w-0">{children(isOver)}</span>;
}

function SketchGrid({ projectId, whiteboards }: { projectId: string; whiteboards: Whiteboard[] }) {
  const navigate = useNavigate();
  if (!whiteboards.length) {
    return (
      <EmptyState
        icon={<PenTool />}
        title="No sketches yet"
        text="Sketches are whiteboards for diagrams and quick drawings."
        action={<Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/projects/${projectId}/whiteboards/new`)}><Plus className="h-3.5 w-3.5" /> New sketch</Button>}
        className="min-h-[240px]"
      />
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
      {whiteboards.map(wb => (
        <button
          key={wb.id}
          type="button"
          onClick={() => navigate(`/projects/${projectId}/whiteboards/${wb.id}`)}
          className="flex flex-col gap-2 rounded-lg border bg-card p-2 text-left transition-colors hover:border-foreground/20"
        >
          <SketchThumbnail src={wb.preview_image} className="aspect-[4/3] border border-hairline" />
          <span className="truncate px-0.5 text-sm font-medium">{wb.title || 'Untitled sketch'}</span>
          {wb.updated_at && <span className="-mt-1.5 px-0.5 text-xs text-muted-foreground">Edited {new Date(wb.updated_at + (wb.updated_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
        </button>
      ))}
    </div>
  );
}
