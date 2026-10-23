export interface SortableTask {
  id: string;
  status: string;
  sort_index?: number | null;
  created_at?: string | null;
  subtasks?: SortableTask[] | null;
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

/** Card ids per column id, in display order. */
export type Columns = Record<string, string[]>;

/** Column holding `id`, or `id` itself when it is a column. */
export function findColumn(columns: Columns, id: string): string | undefined {
  if (id in columns) return id;
  return Object.keys(columns).find((key) => columns[key].includes(id));
}

/**
 * Drag-over step: move `activeId` into the column of `overId` (a card or a column). Hovering a card inserts before
 * it, except the column's last card, where it goes after (otherwise a card could never reach the end by hovering).
 * Null when nothing changes: same column, a column being dragged, or an unknown target.
 */
export function moveAcrossColumns(columns: Columns, activeId: string, overId: string): Columns | null {
  if (activeId in columns) return null;
  const from = findColumn(columns, activeId);
  const to = findColumn(columns, overId);
  if (!from || !to || from === to) return null;

  const target = columns[to];
  const overIndex = target.indexOf(overId);
  const isBelowLastItem = overIndex === target.length - 1;
  const index = overId in columns || overIndex < 0 ? target.length : overIndex + (isBelowLastItem ? 1 : 0);
  return {
    ...columns,
    [from]: columns[from].filter((id) => id !== activeId),
    [to]: [...target.slice(0, index), activeId, ...target.slice(index)],
  };
}

/** Final index of a card dropped on `overId` inside `column`: the hovered card's index, or the end for the column. */
export function dropIndex(columns: Columns, column: string, overId: string): number {
  const index = columns[column].indexOf(overId);
  return index === -1 && overId === column ? columns[column].length : index;
}
