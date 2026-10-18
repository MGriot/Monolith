import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';

/** Matches MAX_UPLOAD_MB on the server; checked here so a big file fails at once instead of after uploading. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const CONCURRENCY = 3;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  folderId: string;
  folderName: string;
  progress: number;
  status: UploadStatus;
  error?: string;
}

let nextId = 1;

const errorText = (err: unknown) => {
  const e = err as { code?: string; response?: { status?: number; data?: { detail?: string } } };
  if (e?.code === 'ERR_CANCELED') return 'Cancelled';
  if (e?.response?.status === 413) return 'Larger than the 50 MB limit';
  return e?.response?.data?.detail || 'Upload failed';
};

/** Uploads files to folders, three at a time, with progress, cancel and retry. */
export function useUploadQueue(onUploaded: (item: UploadItem) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => { onUploadedRef.current = onUploaded; }, [onUploaded]);

  const patch = useCallback((id: string, change: Partial<UploadItem>) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...change } : i)));
  }, []);

  const start = useCallback((item: UploadItem) => {
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    const form = new FormData();
    form.append('file', item.file);
    api
      .post(`/folders/${item.folderId}/upload`, form, {
        signal: controller.signal,
        onUploadProgress: (e) => {
          if (e.total) patch(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
        },
      })
      .then(() => {
        patch(item.id, { status: 'done', progress: 100 });
        onUploadedRef.current({ ...item, status: 'done' });
      })
      .catch((err) => {
        const cancelled = (err as { code?: string })?.code === 'ERR_CANCELED';
        patch(item.id, { status: cancelled ? 'cancelled' : 'error', error: errorText(err) });
      })
      .finally(() => controllers.current.delete(item.id));
  }, [patch]);

  // Start queued items whenever a slot frees up.
  useEffect(() => {
    const running = items.filter(i => i.status === 'uploading').length;
    const waiting = items.filter(i => i.status === 'queued').slice(0, Math.max(0, CONCURRENCY - running));
    if (!waiting.length) return;
    setItems(prev => prev.map(i => (waiting.some(w => w.id === i.id) ? { ...i, status: 'uploading' } : i)));
    waiting.forEach(start);
  }, [items, start]);

  const enqueue = useCallback((files: File[], folderId: string, folderName: string) => {
    const added: UploadItem[] = files.map(file => {
      const tooBig = file.size > MAX_UPLOAD_BYTES;
      return {
        id: String(nextId++),
        file,
        folderId,
        folderName,
        progress: 0,
        status: tooBig ? 'error' : 'queued',
        error: tooBig ? 'Larger than the 50 MB limit' : undefined,
      };
    });
    setItems(prev => [...prev, ...added]);
  }, []);

  const cancel = useCallback((id: string) => {
    const c = controllers.current.get(id);
    if (c) c.abort();
    else patch(id, { status: 'cancelled', error: 'Cancelled' });
  }, [patch]);

  const retry = useCallback((id: string) => patch(id, { status: 'queued', progress: 0, error: undefined }), [patch]);

  const clearFinished = useCallback(() => {
    setItems(prev => prev.filter(i => i.status === 'queued' || i.status === 'uploading'));
  }, []);

  return { items, enqueue, cancel, retry, clearFinished };
}
