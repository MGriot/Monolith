import { useState, useEffect } from 'react';
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
import { MoreVertical, GripVertical, Plus, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  topic?: string;
  assignees?: { id: string; full_name: string; email: string }[];
}

interface KanbanBoardProps {
  tasks: Task[];
  onTaskMove: (taskId: string, newStatus: string) => void;
  onAddTask?: (status: string) => void;
  onTaskClick?: (task: Task) => void;
}

const COLUMNS = [
  { id: 'Todo', title: 'To Do' },
  { id: 'In Progress', title: 'In Progress' },
  { id: 'Review', title: 'Review' },
  { id: 'Done', title: 'Done' }
];

export default function KanbanBoard({ tasks, onTaskMove, onAddTask, onTaskClick }: KanbanBoardProps) {
  const [items, setItems] = useState<Record<string, string[]>>({
    'Backlog': [],
    'Todo': [],
    'In Progress': [],
    'Review': [],
    'Done': []
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const newItems: Record<string, string[]> = {
      'Backlog': [],
      'Todo': [],
      'In Progress': [],
      'Review': [],
      'Done': []
    };
    tasks.forEach(task => {
      if (newItems[task.status]) {
        newItems[task.status].push(task.id);
      }
    });
    setItems(newItems);
  }, [tasks]);

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
      const activeIndex = activeItems.indexOf(active.id as string);
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
          items[activeContainer][activeIndex],
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
        setItems((items) => ({
          ...items,
          [overContainer]: arrayMove(items[overContainer], activeIndex, overIndex)
        }));
        
        if (activeContainer !== overContainer) {
          onTaskMove(active.id as string, overContainer);
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
      <div className="flex gap-6 h-full overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumn 
            key={col.id} 
            id={col.id} 
            title={col.title} 
            taskIds={items[col.id] || []} 
            tasks={tasks}
            onAddTask={onAddTask}
            onTaskClick={onTaskClick}
          />
        ))}
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
            task={tasks.find(t => t.id === activeId)!} 
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
  taskIds: string[];
  tasks: Task[];
  onAddTask?: (status: string) => void;
  onTaskClick?: (task: Task) => void;
}

function KanbanColumn({ id, title, taskIds, tasks, onAddTask, onTaskClick }: KanbanColumnProps) {
  return (
    <div className="flex flex-col w-80 shrink-0">
      <div className="flex items-center justify-between mb-4 px-2">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          {title}
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
            {taskIds.length}
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
      
      <SortableContext id={id} items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 bg-slate-50/50 rounded-xl p-3 border border-slate-100 min-h-[400px]">
          {taskIds.map((taskId) => (
            <SortableTaskCard 
              key={taskId} 
              task={tasks.find(t => t.id === taskId)!} 
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableTaskCard({ task, onTaskClick }: { task: Task, onTaskClick?: (task: Task) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-0")}>
      <TaskCard 
        task={task} 
        dragProps={{ ...attributes, ...listeners }} 
        onClick={() => onTaskClick?.(task)}
      />
    </div>
  );
}

function TaskCard({ task, isDragging, dragProps, onClick }: { task: Task, isDragging?: boolean, dragProps?: any, onClick?: () => void }) {
  const priorityColors: Record<string, string> = {
    Low: "bg-blue-100 text-blue-700",
    Medium: "bg-yellow-100 text-yellow-700",
    High: "bg-orange-100 text-orange-700",
    Critical: "bg-red-100 text-red-700",
  };

  return (
    <Card 
      className={cn(
        "mb-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group",
        isDragging && "shadow-xl border-primary/50"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">{task.title}</CardTitle>
          <div {...dragProps} className="cursor-grab active:cursor-grabbing text-slate-300 group-hover:text-slate-400">
            <GripVertical className="w-4 h-4" />
          </div>
        </div>
        
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 capitalize border-none", priorityColors[task.priority])}>
              {task.priority}
            </Badge>
            {task.topic && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {task.topic}
              </Badge>
            )}
          </div>
          
          <div className="flex -space-x-1.5 overflow-hidden">
            {task.assignees?.map((u) => (
              <div 
                key={u.id}
                className="inline-block h-5 w-5 rounded-full bg-slate-100 border border-white flex items-center justify-center ring-0"
                title={u.full_name || u.email}
              >
                <UserIcon className="w-2.5 h-2.5 text-slate-500" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
