import { Input } from '@/components/ui/input';
import { DEFAULT_MODEL, WEEKDAYS, WEEKDAY_LABELS, buildRule, describeRule, parseRule, type Freq, type RecurrenceModel } from '@/lib/recurrence';

const selectClass = 'h-8 rounded-md border border-border bg-background px-2 text-xs font-medium';

/** "Repeat" editor for a task (the caller supplies the heading); value is the RRULE string (or null/'' for none). Completing the task creates the next one. */
export function RecurrenceField({ value, onChange }: { value: string | null | undefined; onChange: (rule: string | null) => void }) {
  const model = parseRule(value);
  const update = (patch: Partial<RecurrenceModel>) => onChange(buildRule({ ...(model ?? DEFAULT_MODEL), ...patch }));

  return (
    <div className="space-y-2" data-testid="recurrence-field">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Repeat"
          className={selectClass}
          value={model?.freq ?? ''}
          onChange={(e) => (e.target.value ? update({ freq: e.target.value as Freq, byDay: [] }) : onChange(null))}
        >
          <option value="">Does not repeat</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
        </select>
        {model && (
          <>
            <span className="text-xs text-muted-foreground">every</span>
            <Input
              aria-label="Repeat every"
              type="number" min={1} max={365}
              className="h-8 w-16 text-xs"
              value={model.interval}
              onChange={(e) => update({ interval: Number(e.target.value) })}
            />
            {model.freq === 'MONTHLY' && (
              <select aria-label="Monthly pattern" className={selectClass} value={model.monthlyMode} onChange={(e) => update({ monthlyMode: e.target.value as RecurrenceModel['monthlyMode'] })}>
                <option value="day">on day</option>
                <option value="last">on the last day</option>
                <option value="nth">on the nth weekday</option>
              </select>
            )}
            {model.freq === 'MONTHLY' && model.monthlyMode === 'day' && (
              <Input aria-label="Day of month" type="number" min={1} max={31} className="h-8 w-16 text-xs" value={model.monthDay} onChange={(e) => update({ monthDay: Number(e.target.value) })} />
            )}
            {model.freq === 'MONTHLY' && model.monthlyMode === 'nth' && (
              <select aria-label="Nth weekday" className={selectClass} value={model.nth} onChange={(e) => update({ nth: e.target.value })}>
                {['1', '2', '3', '4', '-1'].flatMap((n) => WEEKDAYS.map((d) => (
                  <option key={n + d} value={`${n}${d}`}>{describeRule(`FREQ=MONTHLY;BYDAY=${n}${d}`).replace('Every month on the ', '')}</option>
                )))}
              </select>
            )}
          </>
        )}
      </div>
      {model?.freq === 'WEEKLY' && (
        <div className="flex gap-1" role="group" aria-label="Repeat on">
          {WEEKDAYS.map((d) => {
            const on = model.byDay.includes(d);
            return (
              <button
                key={d} type="button" aria-pressed={on}
                className={`h-7 rounded-md border px-2 text-[11px] font-bold ${on ? 'border-blue-500 bg-blue-500 text-white' : 'border-border bg-background text-fg-soft'}`}
                onClick={() => update({ byDay: on ? model.byDay.filter((x) => x !== d) : [...model.byDay, d] })}
              >
                {WEEKDAY_LABELS[d]}
              </button>
            );
          })}
        </div>
      )}
      {model && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{describeRule(value)}. Until</span>
          <Input aria-label="Repeat until" type="date" className="h-8 w-40 text-xs" value={model.until} onChange={(e) => update({ until: e.target.value })} />
          <span>(optional) — the next copy is created when you mark the task Done.</span>
        </div>
      )}
    </div>
  );
}
