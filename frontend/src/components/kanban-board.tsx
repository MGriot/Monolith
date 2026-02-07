import { useState, useEffect, useMemo } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoreVertical, GripVertical, Plus, User as UserIcon, Milestone, AlertTriangle, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task, Subtask } from '@/types';

interface KanbanItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  topic?: string;
  wbs_code?: string;
  is_milestone?: boolean;
  deadline_at?: string;
  assignees?: { id: string; full_name: string; email: string }[];
  type: 'task' | 'subtask';
  parentId?: string;
  project?: { id: string; name: string };
}

interface KanbanBoardProps {
  tasks: Task[];
  onTaskMove: (taskId: string, newStatus: string) => void;
  onSubtaskMove: (subtaskId: string, newStatus: string) => void;
  onAddTask?: (status: string) => void;
  onTaskClick?: (task: Task) => void;
  onSubtaskClick?: (subtask: Subtask) => void;
}

const COLUMNS = [
  { id: 'Todo', title: 'To Do' },
  { id: 'In Progress', title: 'In Progress' },
  { id: 'Review', title: 'Review' },
  { id: 'Done', title: 'Done' }
];

export default function KanbanBoard({ tasks, onTaskMove, onSubtaskMove, onAddTask, onTaskClick, onSubtaskClick }: KanbanBoardProps) {
  const [items, setItems] = useState<Record<string, string[]>>({
    'Backlog': [],
    'Todo': [],
    'In Progress': [],
    'Review': [],
    'Done': []
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  // Flatten tasks recursively
  const kanbanItems = useMemo(() => {
    const list: KanbanItem[] = [];
    
    const flatten = (taskList: Task[], parent?: Task) => {
        taskList.forEach(task => {
            list.push({ 
                ...task, 
                type: task.parent_id ? 'subtask' : 'task', 
                topic: task.topic || parent?.topic, 
                parentId: task.parent_id || undefined,
                project: task.project || parent?.project
            } as any);
            
            if (task.subtasks && task.subtasks.length > 0) {
                flatten(task.subtasks, task);
            }
        });
    };

    flatten(tasks);
    return list;
  }, [tasks]);

  useEffect(() => {
    const newItems: Record<string, string[]> = {
      'Backlog': [],
      'Todo': [],
      'In Progress': [],
      'Review': [],
      'Done': []
    };
    kanbanItems.forEach((item: KanbanItem) => {
      if (newItems[item.status]) {
        newItems[item.status].push(item.id);
      }
    });
    setItems(newItems);
  }, [kanbanItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function findContainer(id: string) {
    if (id in items) return id;
    return Object.keys(items).find((key) => items[key].includes(id));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    const overId = over?.id;

    if (!overId || active.id in items) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(overId as string);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const overIndex = overItems.indexOf(overId as string);

      let newIndex;
      if (overId in prev) {
        newIndex = overItems.length + 1;
      } else {
        const isBelowLastItem = over && overIndex === overItems.length - 1;
        const modifier = isBelowLastItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      return {
        ...prev,
        [activeContainer]: activeItems.filter((item) => item !== active.id),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          active.id as string,
          ...overItems.slice(newIndex, overItems.length)
        ]
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeContainer = findContainer(active.id as string);
    const overId = over?.id;

    if (!overId || !activeContainer) {
      setActiveId(null);
      return;
    }

    const overContainer = findContainer(overId as string);

    if (overContainer) {
      const activeIndex = items[activeContainer].indexOf(active.id as string);
      const overIndex = items[overContainer].indexOf(overId as string);

      if (activeIndex !== overIndex || activeContainer !== overContainer) {
        setItems((prev) => ({
          ...prev,
          [overContainer]: arrayMove(prev[overContainer], activeIndex, overIndex)
        }));
        
        if (activeContainer !== overContainer) {
          const movedItem = kanbanItems.find((i: KanbanItem) => i.id === active.id);
          if (movedItem) {
            if (movedItem.type === 'task') {
              onTaskMove(movedItem.id, overContainer);
            } else {
              onSubtaskMove(movedItem.id, overContainer);
            }
          }
        }
      }
    }

    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-x-auto pb-4">
        <div className="flex gap-6 min-w-min mx-auto justify-center px-6">
          {COLUMNS.map((col) => (
            <KanbanColumn 
              key={col.id} 
              id={col.id} 
              title={col.title} 
              itemIds={items[col.id] || []} 
              kanbanItems={kanbanItems}
              onAddTask={onAddTask}
              onItemClick={(item: KanbanItem) => {
                if (item.type === 'task') {
                    onTaskClick?.(item as any);
                } else {
                    onSubtaskClick?.(item as any);
                }
              }}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={{
        sideEffects: defaultDropAnimationSideEffects({
          styles: {
            active: {
              opacity: '0.5',
            },
          },
        }),
      }}>
        {activeId ? (
          <TaskCard 
            item={kanbanItems.find((i: KanbanItem) => i.id === activeId)!} 
            isDragging 
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface KanbanColumnProps {
  id: string;
  title: string;
  itemIds: string[];
  kanbanItems: KanbanItem[];
  onAddTask?: (status: string) => void;
  onItemClick: (item: KanbanItem) => void;
}

function KanbanColumn({ id, title, itemIds, kanbanItems, onAddTask, onItemClick }: KanbanColumnProps) {
  return (
    <div className="flex flex-col w-80 shrink-0">
      <div className="flex items-center justify-between mb-4 px-2">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          {title}
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
            {itemIds.length}
          </span>
        </h3>
        <div className="flex items-center gap-1">
          {onAddTask && (
            <button 
              onClick={() => onAddTask(id)}
              className="p-1 hover:bg-slate-100 rounded-md text-slate-500 transition-colors"
              title="Add Task"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
        </div>
      </div>
      
      <SortableContext id={id} items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 bg-slate-50/50 rounded-xl p-3 border border-slate-100 min-h-[400px]">
          {itemIds.map((itemId) => {
            const item = kanbanItems.find((i: KanbanItem) => i.id === itemId);
            if (!item) return null;
            return (
                <SortableTaskCard 
                  key={itemId} 
                  item={item} 
                  onClick={() => onItemClick(item)}
                />
            );
          })}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableTaskCard({ item, onClick }: { item: KanbanItem, onClick?: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-0")}>
      <TaskCard 
        item={item} 
        dragProps={{ ...attributes, ...listeners }} 
        onClick={onClick}
      />
    </div>
  );
}

function TaskCard({ item, isDragging, dragProps, onClick }: { item: KanbanItem, isDragging?: boolean, dragProps?: any, onClick?: () => void }) {
  const priorityStyles: Record<string, { border: string, badge: string }> = {
    Low: { border: "border-l-blue-400", badge: "bg-blue-100 text-blue-700" },
    Medium: { border: "border-l-amber-400", badge: "bg-amber-100 text-amber-700" },
    High: { border: "border-l-orange-400", badge: "bg-orange-100 text-orange-700" },
    Critical: { border: "border-l-red-500", badge: "bg-red-100 text-red-700" },
  };

  const style = priorityStyles[item.priority] || priorityStyles.Medium;
  const isDone = item.status === 'Done' || item.status === 'done';

  return (
    <Card 
      className={cn(
        "mb-3 shadow-sm hover:shadow-md transition-all cursor-pointer group border-l-4",
        style.border,
        isDragging && "shadow-xl border-primary/50",
        isDone && "bg-slate-50 opacity-80 hover:opacity-100"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[8px] font-black text-slate-400">{item.wbs_code}</span>
                {item.type === 'subtask' && (
                    <span className="text-[8px] font-black text-primary uppercase">Subtask</span>
                )}
                {item.project && (
                  <span className="text-[8px] font-black text-slate-500 uppercase flex items-center gap-1">
                    <Folder className="w-2 h-2" />
                    {item.project.name}
                  </span>
                )}
            </div>
            <CardTitle className={cn(
                "text-xs font-bold leading-snug flex items-center gap-1.5",
                isDone ? "text-slate-500 line-through" : "text-slate-900"
            )}>
                {item.is_milestone && <Milestone className="w-3 h-3 text-blue-500 shrink-0" />}
                {item.title}
                {!isDone && (item as any).due_date && new Date((item as any).due_date) < new Date() && (
                  <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />
                )}
            </CardTitle>
          </div>
          <div {...dragProps} className="cursor-grab active:cursor-grabbing text-slate-300 group-hover:text-slate-400 shrink-0">
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        </div>
        
        {item.deadline_at && (
            <div className="flex items-center gap-1 text-[9px] font-black text-red-500">
                <AlertTriangle className="w-2.5 h-2.5" />
                {new Date(item.deadline_at).toLocaleDateString()}
            </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 capitalize border-none font-black", style.badge)}>
              {item.priority}
            </Badge>
            {item.topic && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-slate-100 text-slate-500 font-bold border-none">
                {item.topic}
              </Badge>
            )}
          </div>
          
          <div className="flex -space-x-1.5 overflow-hidden">
            {item.assignees?.map((u) => (
              <div 
                key={u.id}
                className="inline-block h-5 w-5 rounded-full bg-white border border-slate-200 flex items-center justify-center ring-0 shadow-sm"
                title={u.full_name || u.email}
              >
                <UserIcon className="w-2.5 h-2.5 text-slate-400" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
