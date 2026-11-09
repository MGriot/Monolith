import { useState } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { dropIndex, findColumn, moveAcrossColumns, type Columns } from '@/lib/kanban';

export interface KanbanDrop {
  id: string;
  /** Column the card was picked up from. */
  from: string;
  /** Column it was dropped in. */
  to: string;
  /** Position in `to` before the drop settled, and the final position. */
  fromIndex: number;
  toIndex: number;
}

/**
 * Drag state for a column board (dnd-kit). The board shows `columns` and moves cards locally while dragging; it
 * re-reads `columns` whenever the caller passes a new object or bumps `resetKey` (e.g. after a failed move).
 * `onDrop` fires only when a card changed column or position.
 */
export function useKanbanDnd({ columns, resetKey, onDrop }: {
  columns: Columns;
  resetKey?: unknown;
  onDrop: (drop: KanbanDrop) => void;
}) {
  const [items, setItems] = useState(columns);
  // Reset local order when the source changes (adjusting state during render, not in an effect).
  const [source, setSource] = useState({ columns, resetKey });
  if (source.columns !== columns || source.resetKey !== resetKey) {
    setSource({ columns, resetKey });
    setItems(columns);
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialColumn, setInitialColumn] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    setInitialColumn(findColumn(items, id) ?? null);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setItems((prev) => moveAcrossColumns(prev, String(active.id), String(over.id)) ?? prev);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const from = initialColumn;
    setActiveId(null);
    setInitialColumn(null);
    if (!over) return;

    const id = String(active.id);
    const overId = String(over.id);
    const to = findColumn(items, overId);
    const current = findColumn(items, id);
    if (!to || !current) return;

    const fromIndex = items[current].indexOf(id);
    const toIndex = dropIndex(items, to, overId);
    if (fromIndex === toIndex && current === from) return;

    setItems((prev) => ({ ...prev, [to]: arrayMove(prev[to], fromIndex, toIndex) }));
    onDrop({ id, from: from ?? current, to, fromIndex, toIndex });
  };

  return { items, activeId, sensors, handlers: { onDragStart, onDragOver, onDragEnd } };
}
