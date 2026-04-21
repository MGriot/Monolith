import { useState, useEffect, useMemo } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  rectIntersection, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  useDroppable,
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
import { MoreVertical, GripVertical, Plus, Calendar, FolderKanban, ArrowRight } from 'lucide-react';
import { cn, formatPercent } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import type { Project } from '@/types';

interface ProjectKanbanProps {
  projects: Project[];
  onProjectMove: (projectId: string, newStatus: string) => void;
  onProjectClick: (project: Project) => void;
}

const COLUMNS = [
  { id: 'planning', title: 'Planning' },
  { id: 'active', title: 'Active' },
  { id: 'on hold', title: 'On Hold' },
  { id: 'done', title: 'Done' }
];

export default function ProjectKanban({ projects, onProjectMove, onProjectClick }: ProjectKanbanProps) {
  const [items, setItems] = useState<Record<string, string[]>>({
    'planning': [],
    'active': [],
    'on hold': [],
    'done': []
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const newItems: Record<string, string[]> = {
      'planning': [],
      'active': [],
      'on hold': [],
      'done': []
    };
    projects.forEach((p) => {
      const status = p.status.toLowerCase();
      if (newItems[status]) {
        newItems[status].push(p.id);
      } else {
        newItems['planning'].push(p.id);
      }
    });
    setItems(newItems);
  }, [projects]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
      let newIndex = overId in prev ? overItems.length + 1 : overIndex >= 0 ? overIndex : overItems.length + 1;
      return {
        ...prev,
        [activeContainer]: activeItems.filter((item) => item !== active.id),
        [overContainer]: [...overItems.slice(0, newIndex), active.id as string, ...overItems.slice(newIndex)]
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const overId = over?.id;
    if (!overId) { setActiveId(null); return; }

    const overContainer = findContainer(overId as string);
    const activeContainer = findContainer(active.id as string);

    if (overContainer && activeContainer) {
      if (activeContainer !== overContainer) {
        onProjectMove(active.id as string, overContainer);
      }
    }
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-x-auto pb-4">
        <div className="flex gap-6 min-w-max mx-auto px-6 h-full min-h-[calc(100vh-280px)]">
          {COLUMNS.map((col) => (
            <KanbanColumn 
              key={col.id} 
              id={col.id} 
              title={col.title} 
              projects={projects.filter(p => items[col.id]?.includes(p.id))} 
              onProjectClick={onProjectClick}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={defaultDropAnimationSideEffects as any}>
        {activeId ? (
          <ProjectCard 
            project={projects.find(p => p.id === activeId)!} 
            isDragging 
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ id, title, projects, onProjectClick }: { id: string, title: string, projects: Project[], onProjectClick: (p: Project) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col w-80 shrink-0 h-full">
      <div className="flex items-center justify-between mb-4 px-2 shrink-0">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wider">
          <div className={cn(
              "w-2 h-2 rounded-full",
              id === 'planning' ? "bg-blue-400" :
              id === 'active' ? "bg-amber-400" :
              id === 'done' ? "bg-emerald-400" : "bg-slate-300"
          )} />
          {title}
          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black">
            {projects.length}
          </span>
        </h3>
      </div>
      
      <SortableContext id={id} items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
        <div 
          ref={setNodeRef}
          className={cn(
            "flex-1 bg-slate-100/40 rounded-2xl p-2 border-2 border-dashed border-transparent transition-all duration-300 min-h-[500px] flex flex-col gap-3 overflow-y-auto scrollbar-hide",
            isOver && "bg-primary/5 border-primary/20 ring-4 ring-primary/5 scale-[1.01]"
          )}
        >
          {projects.map((p) => (
            <SortableProjectCard key={p.id} project={p} onClick={() => onProjectClick(p)} />
          ))}
          {projects.length === 0 && !isOver && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2 opacity-50 py-10 font-black uppercase text-[10px]">
                Empty Zone
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableProjectCard({ project, onClick }: { project: Project, onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-0")}>
      <ProjectCard project={project} dragProps={{ ...attributes, ...listeners }} onClick={onClick} />
    </div>
  );
}

function ProjectCard({ project, isDragging, dragProps, onClick }: { project: Project, isDragging?: boolean, dragProps?: any, onClick?: () => void }) {
  return (
    <Card 
      className={cn(
        "shadow-sm hover:shadow-md transition-all cursor-pointer group border-t-2 border-t-primary/20",
        isDragging && "shadow-xl border-primary/50 scale-105",
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-primary transition-colors">{project.name}</h4>
            <div className="flex flex-wrap gap-1 mt-1.5">
                {project.topics?.map(t => (
                    <Badge key={t.id} variant="secondary" className="text-[8px] px-1 py-0 h-3.5 bg-slate-100 text-slate-600 border-none uppercase font-black">{t.name}</Badge>
                ))}
            </div>
          </div>
          <div {...dragProps} className="cursor-grab active:cursor-grabbing text-slate-300 group-hover:text-slate-400 shrink-0 p-1">
            <GripVertical className="w-4 h-4" />
          </div>
        </div>

        <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-tighter">
                <span>Progress</span>
                <span className="text-slate-900">{formatPercent(project.progress_percent)}%</span>
            </div>
            <Progress value={project.progress_percent} className="h-1.5" />
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold border-t pt-3 mt-1 border-slate-50">
            <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-slate-300" />
                {project.due_date ? format(parseISO(project.due_date), 'MMM d, yyyy') : 'No Date'}
            </div>
            <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-primary transition-colors" />
        </div>
      </CardContent>
    </Card>
  );
}
