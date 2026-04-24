import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertCircle } from 'lucide-react';

interface RiskItem {
  id: string;
  name: string;
  type: 'project' | 'task';
  probability: number;
  impact: number;
  priority: string;
}

interface RiskHeatmapProps {
  items: RiskItem[];
}

export default function RiskHeatmap({ items }: RiskHeatmapProps) {
  // Grid coordinates: Impact (X) from 1 to 5, Probability (Y) from 5 down to 1
  const grid = useMemo(() => {
    const matrix: RiskItem[][][] = Array(5).fill(null).map(() => Array(5).fill(null).map(() => []));
    items.forEach(item => {
        // Clamp to 1-5
        const p = Math.max(1, Math.min(5, item.probability));
        const i = Math.max(1, Math.min(5, item.impact));
        matrix[5 - p][i - 1].push(item);
    });
    return matrix;
  }, [items]);

  const getCellColor = (p: number, i: number) => {
    const score = p * i;
    if (score >= 16) return "bg-red-500/80 border-red-600";
    if (score >= 10) return "bg-orange-400/80 border-orange-500";
    if (score >= 6) return "bg-amber-400/80 border-amber-500";
    return "bg-emerald-400/80 border-emerald-500";
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex-1 grid grid-cols-[30px_1fr] grid-rows-[1fr_30px] gap-2">
        {/* Y-Axis Label */}
        <div className="flex flex-col justify-between text-[8px] font-black uppercase text-slate-400 py-2">
          <span>High</span>
          <div className="-rotate-90 origin-center whitespace-nowrap">Probability</div>
          <span>Low</span>
        </div>

        {/* Matrix */}
        <div className="grid grid-cols-5 grid-rows-5 gap-1.5 h-full min-h-[300px]">
          {grid.map((row, pIdx) => (
            row.map((cellItems, iIdx) => {
              const prob = 5 - pIdx;
              const impact = iIdx + 1;
              return (
                <div 
                  key={`${prob}-${impact}`}
                  className={cn(
                      "rounded-md border-2 flex items-center justify-center relative group overflow-hidden transition-all hover:scale-[1.02] hover:z-10",
                      getCellColor(prob, impact)
                  )}
                >
                  <div className="text-[10px] font-black text-white/40 select-none">
                      {prob}x{impact}
                  </div>
                  
                  <div className="absolute inset-0 flex flex-wrap gap-1 p-1 items-center justify-center">
                      {cellItems.slice(0, 4).map(item => (
                          <div 
                              key={item.id}
                              className={cn(
                                  "w-2.5 h-2.5 rounded-full border border-white/50 shadow-sm cursor-pointer hover:scale-150 transition-transform",
                                  item.type === 'project' ? "bg-white" : "bg-white/40"
                              )}
                              title={`${item.name} (${item.type}) - Priority: ${item.priority}`}
                          />
                      ))}
                      {cellItems.length > 4 && (
                          <span className="text-[8px] font-black text-white">+{cellItems.length - 4}</span>
                      )}
                  </div>
                </div>
              );
            })
          ))}
        </div>

        {/* Spacer */}
        <div></div>

        {/* X-Axis Label */}
        <div className="flex justify-between text-[8px] font-black uppercase text-slate-400 px-2">
          <span>Low</span>
          <div className="text-center">Impact / Severity</div>
          <span>Critical</span>
        </div>
      </div>
    </div>
  );
}
