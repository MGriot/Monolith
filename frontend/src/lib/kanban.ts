export interface SortableTask {
  id: string;
  status: string;
  sort_index?: number | null;
  created_at?: string | null;
  subtasks?: SortableTask[] | null;
}

/** Depth-first flat list of tasks and all their descendants. */
export function flattenTasks<T extends SortableTask>(tasks: T[]): T[] {
  const out: T[] = [];
  const walk = (list: T[]) => {
    for (const t of list) {
      out.push(t);
      if (t.subtasks?.length) walk(t.subtasks as T[]);
    }
  };
  walk(tasks);
  return out;
}

const byOrder = (a: SortableTask, b: SortableTask) => {
  const d = (a.sort_index || 0) - (b.sort_index || 0);
  if (d !== 0) return d;
  return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
};

/**
 * `sort_index` for a card dropped at `index` (its final position in the destination column).
 * The moving card is left out of the neighbour lookup, otherwise same-column reorders are off by one.
 */
export function calculateSortIndex(tasks: SortableTask[], container: string, index: number, movingId?: string): number {
  const column = tasks
    .filter((t) => t.id !== movingId && t.status.toLowerCase() === container.toLowerCase())
    .sort(byOrder);

  if (column.length === 0) return 100;
  if (index <= 0) return (column[0].sort_index || 0) - 10;
  if (index >= column.length) return (column[column.length - 1].sort_index || 0) + 10;

  const prev = column[index - 1].sort_index || 0;
  const next = column[index].sort_index || 0;
  // no integer strictly between them: tie-break falls to created_at, which is stable enough
  return next - prev >= 2 ? Math.floor((prev + next) / 2) : prev + 1;
}
