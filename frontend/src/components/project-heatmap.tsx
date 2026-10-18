import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import { subYears, format, parseISO } from 'date-fns';

interface Stat {
  date: string;
  count: number;
}

interface ProjectHeatmapProps {
  stats: Stat[];
  /** heading above the grid; null when the surrounding panel already names it */
  title?: string | null;
}

export default function ProjectHeatmap({ stats, title = "Contribution Activity" }: ProjectHeatmapProps) {
  const endDate = new Date();
  const startDate = subYears(endDate, 1);

  return (
    <div className={title ? "py-4" : undefined}>
      <div className={title ? "flex items-center justify-between mb-6" : "flex items-center justify-end mb-3"}>
        {title && <h3 className="text-sm font-semibold text-fg-body">{title}</h3>}
        <div className="flex items-center gap-2 text-[11px] text-fg-faint">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-muted rounded-sm" />
            <div className="w-3 h-3 bg-success/35 rounded-sm" />
            <div className="w-3 h-3 bg-success/65 rounded-sm" />
            <div className="w-3 h-3 bg-success rounded-sm" />
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
            if (!value || value.count === 0) return 'fill-muted';
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
        .react-calendar-heatmap .fill-muted { fill: hsl(var(--muted)); }
        .react-calendar-heatmap .fill-primary\/30 { fill: hsl(var(--success) / 0.35); }
        .react-calendar-heatmap .fill-primary\/60 { fill: hsl(var(--success) / 0.65); }
        .react-calendar-heatmap .fill-primary { fill: hsl(var(--success)); }
        .react-calendar-heatmap text { fill: hsl(var(--muted-foreground)); font-size: 8px; }
        .react-calendar-heatmap rect { rx: 2; ry: 2; }
      `}</style>
    </div>
  );
}
