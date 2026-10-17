import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { errorMessage } from '@/components/auth-card';
import { chunk, summarizeBulk, type BulkResult } from '@/lib/selection';

/** Server cap per request (POST /tasks/bulk). */
export const BULK_MAX = 200;

export interface BulkPatch {
  status?: string;
  priority?: string;
  assignee_ids?: string[];
}
export type BulkAction = 'archive' | 'restore' | 'delete';
export interface BulkRequest {
  ids: string[];
  patch?: BulkPatch;
  action?: BulkAction;
}

const DONE_VERB: Record<BulkAction | 'update', string> = {
  update: 'updated',
  archive: 'archived',
  restore: 'restored',
  delete: 'deleted',
};

/**
 * Bulk change over POST /tasks/bulk. A selection larger than the cap is split into several requests (each one is
 * atomic on its own). Failures are never swallowed: the toast says how many tasks failed and why.
 */
export function useBulkTasks(onFinished?: (results: BulkResult[]) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (req: BulkRequest) => {
      const results: BulkResult[] = [];
      for (const ids of chunk(req.ids, BULK_MAX)) {
        const body = req.action ? { ids, action: req.action } : { ids, patch: req.patch };
        const res = await api.post<{ results: BulkResult[] }>('/tasks/bulk', body);
        results.push(...res.data.results);
      }
      return results;
    },
    onSuccess: (results, req) => {
      const { succeeded, failed, reasons } = summarizeBulk(results);
      const verb = DONE_VERB[req.action ?? 'update'];
      if (failed === 0) {
        toast.success(`${succeeded} task${succeeded === 1 ? '' : 's'} ${verb}`);
      } else {
        toast.error(`${failed} of ${results.length} task${results.length === 1 ? '' : 's'} could not be changed`, {
          description: reasons.map((r) => `${r.count} x ${r.detail}`).join('; '),
          duration: 10_000,
        });
      }
      for (const key of ['tasks', 'project', 'projects', 'project-stats', 'dashboard']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      onFinished?.(results);
    },
    onError: (err) => toast.error(errorMessage(err, 'Bulk change failed')),
  });
}
