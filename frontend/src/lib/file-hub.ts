// File Hub data helpers: index the flat folder list from GET /folders/, build views, decide what may be dropped where.

export interface HubTopic {
  id: string;
  name: string;
  color?: string | null;
}

export interface HubFile {
  id: string;
  name: string;
  url: string;
  content?: string | null;
  extension?: string | null;
  size_bytes?: number | null;
  folder_id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  topics?: HubTopic[];
}

export interface HubFolder {
  id: string;
  name: string;
  type?: 'generic' | 'media' | 'notes';
  parent_id: string | null;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
  files: HubFile[];
}

export type FileKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'note' | 'archive' | 'media' | 'other';

export const KIND_LABELS: Record<FileKind, string> = {
  image: 'Images',
  pdf: 'PDFs',
  doc: 'Documents',
  sheet: 'Spreadsheets',
  slides: 'Presentations',
  note: 'Notes',
  archive: 'Archives',
  media: 'Audio & video',
  other: 'Other',
};

const KIND_BY_EXT: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', avif: 'image',
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', txt: 'doc',
  xls: 'sheet', xlsx: 'sheet', ods: 'sheet', csv: 'sheet',
  ppt: 'slides', pptx: 'slides', odp: 'slides', key: 'slides',
  md: 'note',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  mp3: 'media', wav: 'media', m4a: 'media', ogg: 'media', mp4: 'media', mov: 'media', webm: 'media', mkv: 'media',
};

export function extensionOf(file: Pick<HubFile, 'name' | 'extension'>): string {
  const raw = file.extension || (file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '');
  return raw.replace(/^\./, '').toLowerCase();
}

export function fileKind(file: Pick<HubFile, 'name' | 'extension' | 'url'>): FileKind {
  if (file.url?.startsWith('note://')) return 'note';
  return KIND_BY_EXT[extensionOf(file)] ?? 'other';
}

export function formatBytes(bytes?: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export interface HubIndex {
  byId: Map<string, HubFolder>;
  /** children by parent id; top-level folders under the key null */
  children: Map<string | null, HubFolder[]>;
  files: HubFile[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

export function indexFolders(folders: readonly HubFolder[]): HubIndex {
  const byId = new Map<string, HubFolder>();
  for (const f of folders) byId.set(f.id, f);
  const children = new Map<string | null, HubFolder[]>();
  for (const f of folders) {
    // a parent outside the list (another scope) would hide the folder: treat it as top level
    const parent = f.parent_id && byId.has(f.parent_id) ? f.parent_id : null;
    const list = children.get(parent) ?? [];
    list.push(f);
    children.set(parent, list);
  }
  for (const list of children.values()) list.sort(byName);
  const files = folders.flatMap(f => f.files || []);
  return { byId, children, files };
}

/** Root-to-folder path, for the breadcrumb. */
export function folderPath(index: HubIndex, id: string | null): HubFolder[] {
  const path: HubFolder[] = [];
  const seen = new Set<string>();
  let current = id ? index.byId.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_id ? index.byId.get(current.parent_id) : undefined;
  }
  return path;
}

export function descendantIds(index: HubIndex, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of index.children.get(cur) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
}

export function countFiles(index: HubIndex, id: string): number {
  const ids = descendantIds(index, id);
  ids.add(id);
  let n = 0;
  for (const fid of ids) n += index.byId.get(fid)?.files.length ?? 0;
  return n;
}

export type HubView =
  | { type: 'folder'; id: string | null }
  | { type: 'all' }
  | { type: 'recent' }
  | { type: 'kind'; kind: FileKind }
  | { type: 'topic'; id: string };

export type SortKey = 'name' | 'modified' | 'size';

const RECENT_COUNT = 20;

export function sortFiles(files: readonly HubFile[], key: SortKey): HubFile[] {
  const list = [...files];
  if (key === 'name') return list.sort(byName);
  if (key === 'size') return list.sort((a, b) => (b.size_bytes ?? -1) - (a.size_bytes ?? -1) || byName(a, b));
  return list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '') || byName(a, b));
}

/** Files shown for a view; a search looks through every folder, whatever the view. */
export function filesForView(index: HubIndex, view: HubView, search: string, sort: SortKey): HubFile[] {
  const q = search.trim().toLowerCase();
  if (q) return sortFiles(index.files.filter(f => f.name.toLowerCase().includes(q)), sort);
  switch (view.type) {
    case 'folder':
      return view.id ? sortFiles(index.byId.get(view.id)?.files ?? [], sort) : [];
    case 'all':
      return sortFiles(index.files, sort);
    case 'recent':
      return sortFiles(index.files, 'modified').slice(0, RECENT_COUNT);
    case 'kind':
      return sortFiles(index.files.filter(f => fileKind(f) === view.kind), sort);
    case 'topic':
      return sortFiles(index.files.filter(f => f.topics?.some(t => t.id === view.id)), sort);
  }
}

export function kindCounts(files: readonly HubFile[]): Partial<Record<FileKind, number>> {
  const out: Partial<Record<FileKind, number>> = {};
  for (const f of files) {
    const k = fileKind(f);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** A folder may not be dropped on itself, inside its own subtree, or onto its current parent (no-op). */
export function canMoveFolder(index: HubIndex, folderId: string, targetId: string | null): boolean {
  if (folderId === targetId) return false;
  const folder = index.byId.get(folderId);
  if (!folder) return false;
  if ((folder.parent_id ?? null) === targetId) return false;
  return targetId === null || !descendantIds(index, folderId).has(targetId);
}

/** Files can go to any other folder; dropping them where they already are does nothing. */
export function filesToMove(files: readonly HubFile[], targetId: string): HubFile[] {
  return files.filter(f => f.folder_id !== targetId);
}
