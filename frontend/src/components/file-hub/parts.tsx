import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  AlertCircle,
  Archive,
  ChevronRight,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Film,
  Folder as FolderIcon,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  NotebookPen,
  Presentation,
  RotateCcw,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fileKind, formatBytes, type FileKind, type HubFile, type HubFolder, type HubIndex } from '@/lib/file-hub';
import type { UploadItem } from '@/hooks/use-upload-queue';

/** Handlers that make an element accept files dragged in from the desktop. */
export interface NativeDropProps {
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

const KIND_STYLE: Record<FileKind, { icon: typeof FileIcon; tone: string; label: string }> = {
  image: { icon: ImageIcon, tone: 'bg-info-soft text-info', label: 'IMG' },
  pdf: { icon: FileText, tone: 'bg-danger-soft text-danger', label: 'PDF' },
  doc: { icon: FileText, tone: 'bg-info-soft text-info', label: 'DOC' },
  sheet: { icon: FileSpreadsheet, tone: 'bg-success-soft text-success', label: 'XLS' },
  slides: { icon: Presentation, tone: 'bg-warning-soft text-warning', label: 'PPT' },
  note: { icon: NotebookPen, tone: 'bg-review-soft text-review', label: 'MD' },
  archive: { icon: Archive, tone: 'bg-muted text-fg-soft', label: 'ZIP' },
  media: { icon: Film, tone: 'bg-review-soft text-review', label: 'AV' },
  other: { icon: FileIcon, tone: 'bg-muted text-fg-soft', label: 'FILE' },
};

export function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const Icon = KIND_STYLE[kind].icon;
  return <Icon className={className} aria-hidden />;
}

/** Image files show themselves, notes show their first lines, everything else a coloured type badge. */
export function FileThumbnail({ file, className, large }: { file: HubFile; className?: string; large?: boolean }) {
  const kind = fileKind(file);
  const [broken, setBroken] = useState(false);
  const style = KIND_STYLE[kind];

  if (kind === 'image' && !broken) {
    return (
      <div className={cn('overflow-hidden rounded-md bg-subtle', className)}>
        <img src={file.url} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (kind === 'note') {
    const lines = (file.content || '').split('\n').map(l => l.replace(/^#+\s*/, '').trim()).filter(Boolean).slice(0, large ? 8 : 4);
    return (
      <div className={cn('overflow-hidden rounded-md border border-hairline bg-background p-2.5 text-left', className)}>
        {lines.length ? (
          lines.map((l, i) => (
            <p key={i} className={cn('truncate leading-snug text-fg-soft', large ? 'text-xs' : 'text-[11px]', i === 0 && 'font-medium text-foreground')}>{l}</p>
          ))
        ) : (
          <p className="text-[11px] text-fg-faint">Empty note</p>
        )}
      </div>
    );
  }

  const Icon = style.icon;
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1.5 rounded-md bg-subtle', className)}>
      <Icon className={cn(large ? 'h-10 w-10' : 'h-7 w-7', 'text-fg-ghost')} aria-hidden />
      <span className={cn('rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold', style.tone)}>{style.label}</span>
    </div>
  );
}

interface FileCardProps {
  file: HubFile;
  selected: boolean;
  focused: boolean;
  view: 'grid' | 'list';
  folderName?: string;
  onSelect: (e: React.MouseEvent) => void;
  onOpen: () => void;
}

export function FileCard({ file, selected, focused, view, folderName, onSelect, onOpen }: FileCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `file:${file.id}`, data: { kind: 'file', id: file.id } });
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ block: 'nearest' }); }, [focused]);
  const meta = [formatBytes(file.size_bytes), new Date(file.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ');

  const common = {
    ref: (el: HTMLDivElement | null) => { setNodeRef(el); ref.current = el; },
    ...attributes,
    ...listeners,
    role: 'option' as const,
    'aria-selected': selected,
    'data-file-id': file.id,
    onClick: onSelect,
    onDoubleClick: onOpen,
    title: file.name,
  };

  if (view === 'list') {
    return (
      <div
        {...common}
        className={cn(
          'flex h-11 cursor-default select-none items-center gap-3 rounded-md px-3 text-sm outline-none transition-colors',
          selected ? 'bg-info-soft' : 'hover:bg-subtle',
          focused && 'ring-1 ring-info',
          isDragging && 'opacity-40'
        )}
      >
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded', KIND_STYLE[fileKind(file)].tone)}>
          <KindIcon kind={fileKind(file)} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
        {folderName && <span className="hidden max-w-[10rem] truncate text-xs text-fg-faint md:inline">{folderName}</span>}
        <TopicDots file={file} />
        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-fg-faint">{meta}</span>
      </div>
    );
  }

  return (
    <div
      {...common}
      className={cn(
        'group flex min-w-0 cursor-default select-none flex-col gap-2 rounded-lg border bg-card p-2 outline-none transition-[border-color,box-shadow]',
        selected ? 'border-info ring-2 ring-info/25' : 'hover:border-foreground/20',
        focused && !selected && 'ring-1 ring-info/50',
        isDragging && 'opacity-40'
      )}
    >
      <FileThumbnail file={file} className="aspect-[4/3] w-full" />
      <div className="min-w-0 px-0.5">
        <p className="truncate text-sm font-medium leading-tight">{file.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs tabular-nums text-fg-faint">{folderName ? `${folderName} · ${meta}` : meta}</span>
          <TopicDots file={file} />
        </div>
      </div>
    </div>
  );
}

function TopicDots({ file }: { file: HubFile }) {
  if (!file.topics?.length) return null;
  return (
    <span className="flex shrink-0 -space-x-1" title={file.topics.map(t => t.name).join(', ')}>
      {file.topics.slice(0, 3).map(t => (
        <span key={t.id} className="h-2.5 w-2.5 rounded-full ring-2 ring-card" style={{ backgroundColor: t.color || '#64748b' }} />
      ))}
    </span>
  );
}

interface FolderCardProps {
  folder: HubFolder;
  fileCount: number;
  nativeOver: boolean;
  nativeDrop: NativeDropProps;
  renaming: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  menu: ReactNode;
}

export function FolderCard({ folder, fileCount, nativeOver, nativeDrop, renaming, onOpen, onRename, onCancelRename, menu }: FolderCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `folder:${folder.id}`, data: { kind: 'folder', id: folder.id } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `card:${folder.id}`, data: { kind: 'folder-target', id: folder.id } });
  const over = isOver || nativeOver;

  return (
    <div
      ref={(el) => { setDragRef(el); setDropRef(el); }}
      {...(renaming ? {} : { ...attributes, ...listeners })}
      {...nativeDrop}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' && !renaming) onOpen(); }}
      className={cn(
        'group flex min-w-0 cursor-default select-none items-center gap-3 rounded-lg border bg-card px-3 py-2.5 outline-none transition-colors',
        over ? 'border-info bg-info-soft ring-2 ring-info/30' : 'hover:border-foreground/20',
        isDragging && 'opacity-40'
      )}
    >
      {over ? <FolderOpen className="h-5 w-5 shrink-0 text-info" /> : <FolderIcon className="h-5 w-5 shrink-0 text-fg-faint" />}
      <div className="min-w-0 flex-1">
        {renaming ? (
          <InlineName initial={folder.name} onSubmit={onRename} onCancel={onCancelRename} />
        ) : (
          <button type="button" onClick={onOpen} className="block w-full truncate text-left text-sm font-medium hover:underline">
            {folder.name}
          </button>
        )}
        <p className="text-xs tabular-nums text-fg-faint">{over ? 'Drop to move here' : `${fileCount} file${fileCount === 1 ? '' : 's'}`}</p>
      </div>
      {menu}
    </div>
  );
}

export function InlineName({ initial, onSubmit, onCancel }: { initial: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  const commit = () => {
    const v = value.trim();
    if (v && v !== initial) onSubmit(v);
    else onCancel();
  };
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      aria-label="Name"
      className="h-7 w-full rounded border border-info bg-background px-1.5 text-sm outline-none ring-2 ring-info/20"
    />
  );
}

interface TreeNodeProps {
  index: HubIndex;
  folder: HubFolder;
  depth: number;
  activeId: string | null;
  expanded: ReadonlySet<string>;
  dragging: boolean;
  nativeTarget: string | null;
  nativeDropFor: (id: string, name: string) => NativeDropProps;
  onToggle: (id: string, open?: boolean) => void;
  onOpen: (id: string) => void;
}

/** Folder tree row: click opens, chevron expands, and it accepts files and folders (expanding after a short hover). */
export function TreeNode(props: TreeNodeProps) {
  const { index, folder, depth, activeId, expanded, dragging, nativeTarget, nativeDropFor, onToggle, onOpen } = props;
  const { setNodeRef, isOver } = useDroppable({ id: `tree:${folder.id}`, data: { kind: 'folder-target', id: folder.id } });
  const children = index.children.get(folder.id) ?? [];
  const isOpen = expanded.has(folder.id);
  const over = isOver || nativeTarget === folder.id;

  // Hovering a closed folder while dragging opens it, like a desktop file manager.
  useEffect(() => {
    if (!over || isOpen || !children.length || !(dragging || nativeTarget === folder.id)) return;
    const t = window.setTimeout(() => onToggle(folder.id, true), 600);
    return () => window.clearTimeout(t);
  }, [over, isOpen, children.length, dragging, nativeTarget, folder.id, onToggle]);

  return (
    <li>
      <div
        ref={setNodeRef}
        {...nativeDropFor(folder.id, folder.name)}
        className={cn(
          'group flex h-8 items-center gap-1 rounded-md pr-2 text-sm transition-colors',
          over ? 'bg-info-soft text-info ring-1 ring-info' : activeId === folder.id ? 'bg-muted font-medium text-foreground' : 'text-fg-soft hover:bg-subtle hover:text-foreground'
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          onClick={() => onToggle(folder.id)}
          className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-faint hover:bg-muted', !children.length && 'invisible')}
          aria-label={isOpen ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          aria-expanded={isOpen}
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
        </button>
        <button type="button" onClick={() => onOpen(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {over || activeId === folder.id ? <FolderOpen className="h-4 w-4 shrink-0" /> : <FolderIcon className="h-4 w-4 shrink-0 text-fg-faint" />}
          <span className="truncate">{folder.name}</span>
        </button>
        {over && <span className="shrink-0 text-[11px] font-medium">Drop</span>}
      </div>
      {isOpen && children.length > 0 && (
        <ul>
          {children.map(child => (
            <TreeNode key={child.id} {...props} folder={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A sidebar entry that is also a drop target (topics, the top level). */
export function DropNavItem({
  id,
  data,
  active,
  icon,
  label,
  count,
  overLabel,
  onClick,
}: {
  id: string;
  data: Record<string, unknown>;
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  overLabel: string;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors',
        isOver ? 'bg-info-soft text-info ring-1 ring-info' : active ? 'bg-muted font-medium text-foreground' : 'text-fg-soft hover:bg-subtle hover:text-foreground'
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {isOver ? <span className="text-[11px] font-medium">{overLabel}</span> : count !== undefined && <span className="text-xs tabular-nums text-fg-faint">{count}</span>}
    </button>
  );
}

export function UploadTray({
  items,
  onCancel,
  onRetry,
  onClear,
}: {
  items: UploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onClear: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!items.length) return null;
  const active = items.filter(i => i.status === 'queued' || i.status === 'uploading').length;
  const failed = items.filter(i => i.status === 'error').length;
  const title = active
    ? `Uploading ${active} file${active === 1 ? '' : 's'}`
    : failed
      ? `${failed} upload${failed === 1 ? '' : 's'} failed`
      : `${items.length} upload${items.length === 1 ? '' : 's'} complete`;

  return (
    <div className="absolute bottom-3 right-3 z-20 w-80 max-w-[calc(100%-1.5rem)] overflow-hidden rounded-xl border bg-popover shadow-lg" role="status" aria-live="polite">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {active ? <Loader2 className="h-4 w-4 animate-spin text-info" /> : failed ? <AlertCircle className="h-4 w-4 text-danger" /> : null}
        <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium" onClick={() => setCollapsed(c => !c)}>
          {title}
        </button>
        {!active && (
          <button type="button" onClick={onClear} className="rounded p-1 text-fg-faint hover:bg-muted hover:text-foreground" aria-label="Close upload list">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!collapsed && (
        <ul className="max-h-56 divide-y divide-hairline overflow-y-auto">
          {items.map(item => (
            <li key={item.id} className="space-y-1 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium" title={item.file.name}>{item.file.name}</span>
                {item.status === 'uploading' && <span className="tabular-nums text-fg-faint">{item.progress}%</span>}
                {item.status === 'queued' && <span className="text-fg-faint">Waiting</span>}
                {item.status === 'done' && <span className="text-success">Done</span>}
                {(item.status === 'uploading' || item.status === 'queued') && (
                  <button type="button" onClick={() => onCancel(item.id)} className="rounded p-0.5 text-fg-faint hover:text-foreground" aria-label={`Cancel ${item.file.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                )}
                {(item.status === 'error' || item.status === 'cancelled') && (
                  <button type="button" onClick={() => onRetry(item.id)} className="inline-flex items-center gap-1 rounded px-1 text-fg-soft hover:text-foreground" aria-label={`Retry ${item.file.name}`}>
                    <RotateCcw className="h-3 w-3" /> Retry
                  </button>
                )}
              </div>
              {item.status === 'uploading' || item.status === 'queued' ? (
                <div className="h-1 overflow-hidden rounded-full bg-hairline">
                  <div className="h-full rounded-full bg-info transition-[width]" style={{ width: `${item.progress}%` }} />
                </div>
              ) : item.error ? (
                <p className={cn('text-[11px]', item.status === 'error' ? 'text-danger' : 'text-fg-faint')}>{item.error}</p>
              ) : (
                <p className="text-[11px] text-fg-faint">to {item.folderName}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
