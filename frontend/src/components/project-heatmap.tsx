import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import { subYears, format, parseISO, startOfDay } from 'date-fns';

interface Stat {
  date: string;
  count: number;
}

interface ProjectHeatmapProps {
  stats: Stat[];
  projectStartDate?: string;
  projectDueDate?: string;
}

export default function ProjectHeatmap({ stats, projectStartDate, projectDueDate }: ProjectHeatmapProps) {
  const endDate = projectDueDate ? parseISO(projectDueDate) : new Date();
  const startDate = projectStartDate ? parseISO(projectStartDate) : subYears(endDate, 1);

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-slate-700">Contribution Activity</h3>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-slate-100 rounded-sm" />
            <div className="w-3 h-3 bg-primary/30 rounded-sm" />
            <div className="w-3 h-3 bg-primary/60 rounded-sm" />
            <div className="w-3 h-3 bg-primary rounded-sm" />
          </div>
          <span>More</span>
        </div>
      </div>
      
      <div className="contribution-heatmap">
        <CalendarHeatmap
          startDate={startDate}
          endDate={endDate}
          values={stats}
          classForValue={(value: any) => {
            if (!value || value.count === 0) return 'fill-slate-100';
            if (value.count < 3) return 'fill-primary/30';
            if (value.count < 6) return 'fill-primary/60';
            return 'fill-primary';
          }}
          tooltipDataAttrs={(value: any) => {
            if (!value || !value.date) return { 'data-tooltip-id': 'heatmap-tooltip', 'data-tooltip-content': 'No activity' } as any;
            return {
              'data-tooltip-id': 'heatmap-tooltip',
              'data-tooltip-content': `${value.count} tasks completed on ${format(parseISO(value.date), 'MMM d, yyyy')}`,
            } as any;
          }}
        />
        <Tooltip id="heatmap-tooltip" />
      </div>

      <style>{`
        .react-calendar-heatmap .fill-slate-100 { fill: #f1f5f9; }
        .react-calendar-heatmap .fill-primary\/30 { fill: #93c5fd; }
        .react-calendar-heatmap .fill-primary\/60 { fill: #3b82f6; }
        .react-calendar-heatmap .fill-primary { fill: #2563eb; }
        .react-calendar-heatmap rect { rx: 2; ry: 2; }
      `}</style>
    </div>
  );
}
