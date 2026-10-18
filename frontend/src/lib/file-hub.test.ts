import { describe, expect, it } from 'vitest';
import {
  canMoveFolder,
  countFiles,
  fileKind,
  filesForView,
  filesToMove,
  folderPath,
  formatBytes,
  indexFolders,
  type HubFile,
  type HubFolder,
} from './file-hub';

const file = (id: string, folder_id: string, name: string, extra: Partial<HubFile> = {}): HubFile => ({
  id, folder_id, name, url: `/uploads/${id}`, owner_id: 'u', created_at: '2026-10-01', updated_at: '2026-10-01', ...extra,
});

// Design ── Mockups ── Old
// Contracts
const folders: HubFolder[] = [
  { id: 'design', name: 'Design', parent_id: null, files: [file('f1', 'design', 'hero.PNG', { updated_at: '2026-10-18', size_bytes: 2048 })] },
  { id: 'mockups', name: 'Mockups', parent_id: 'design', files: [file('f2', 'mockups', 'brief.pdf', { topics: [{ id: 't1', name: 'Legal' }] })] },
  { id: 'old', name: 'Old', parent_id: 'mockups', files: [file('f3', 'old', 'notes.md', { url: 'note://internal' })] },
  { id: 'contracts', name: 'contracts', parent_id: null, files: [] },
];
const index = indexFolders(folders);

describe('indexFolders', () => {
  it('nests by parent and sorts names case-insensitively', () => {
    expect(index.children.get(null)!.map(f => f.id)).toEqual(['contracts', 'design']);
    expect(index.children.get('design')!.map(f => f.id)).toEqual(['mockups']);
    expect(index.files).toHaveLength(3);
  });

  it('treats folders whose parent is missing as top level', () => {
    const i = indexFolders([{ id: 'x', name: 'X', parent_id: 'gone', files: [] }]);
    expect(i.children.get(null)!.map(f => f.id)).toEqual(['x']);
  });
});

describe('folderPath and counts', () => {
  it('walks from the root down', () => {
    expect(folderPath(index, 'old').map(f => f.name)).toEqual(['Design', 'Mockups', 'Old']);
    expect(folderPath(index, null)).toEqual([]);
  });

  it('counts files in the whole subtree', () => {
    expect(countFiles(index, 'design')).toBe(3);
    expect(countFiles(index, 'contracts')).toBe(0);
  });
});

describe('fileKind and formatBytes', () => {
  it('reads the extension case-insensitively and knows notes', () => {
    expect(fileKind({ name: 'hero.PNG', url: '/x' })).toBe('image');
    expect(fileKind({ name: 'Untitled', url: 'note://internal' })).toBe('note');
    expect(fileKind({ name: 'a', extension: '.xlsx', url: '/x' })).toBe('sheet');
    expect(fileKind({ name: 'Architecture.excalidraw', url: '/uploads/x.excalidraw' })).toBe('sketch');
    expect(fileKind({ name: 'mystery', url: '/x' })).toBe('other');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1536 * 1024)).toBe('1.5 MB');
    expect(formatBytes(null)).toBe('');
  });
});

describe('filesForView', () => {
  it('shows a folder’s own files only', () => {
    expect(filesForView(index, { type: 'folder', id: 'mockups' }, '', 'name').map(f => f.id)).toEqual(['f2']);
    expect(filesForView(index, { type: 'folder', id: null }, '', 'name')).toEqual([]);
  });

  it('filters by kind and topic, and search spans every folder', () => {
    expect(filesForView(index, { type: 'kind', kind: 'note' }, '', 'name').map(f => f.id)).toEqual(['f3']);
    expect(filesForView(index, { type: 'topic', id: 't1' }, '', 'name').map(f => f.id)).toEqual(['f2']);
    expect(filesForView(index, { type: 'folder', id: 'contracts' }, 'HERO', 'name').map(f => f.id)).toEqual(['f1']);
  });

  it('sorts recent first', () => {
    expect(filesForView(index, { type: 'recent' }, '', 'name')[0].id).toBe('f1');
  });
});

describe('drop rules', () => {
  it('refuses moving a folder into itself, its subtree or where it already is', () => {
    expect(canMoveFolder(index, 'design', 'design')).toBe(false);
    expect(canMoveFolder(index, 'design', 'old')).toBe(false);
    expect(canMoveFolder(index, 'mockups', 'design')).toBe(false);
    expect(canMoveFolder(index, 'old', 'contracts')).toBe(true);
    expect(canMoveFolder(index, 'old', null)).toBe(true);
    expect(canMoveFolder(index, 'design', null)).toBe(false);
  });

  it('skips files that are already in the target', () => {
    expect(filesToMove(index.files, 'mockups').map(f => f.id)).toEqual(['f1', 'f3']);
  });
});
