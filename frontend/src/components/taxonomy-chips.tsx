import { cn } from '@/lib/utils';

interface Named { id: string; name: string; color?: string | null }

/** Topics and work types as small wrapping chips; past `max` the rest collapse into "+N" (hover lists them). */
export function TaxonomyChips({
  topics = [],
  types = [],
  max = 4,
  fallback,
  className,
}: {
  topics?: Named[];
  types?: Named[];
  max?: number;
  fallback?: string;
  className?: string;
}) {
  const items = [
    ...topics.map((t) => ({ ...t, kind: 'topic' as const })),
    ...types.map((t) => ({ ...t, kind: 'type' as const })),
  ];
  if (!items.length) {
    return fallback ? <span className="text-xs text-muted-foreground">{fallback}</span> : null;
  }
  const shown = items.slice(0, max);
  const hidden = items.slice(max);
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((item) => (
        <span
          key={`${item.kind}-${item.id}`}
          title={item.kind === 'topic' ? `Topic: ${item.name}` : `Work type: ${item.name}`}
          className={cn(
            'inline-flex max-w-[11rem] items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-4',
            item.kind === 'topic' ? 'bg-muted text-fg-soft' : 'border border-border text-muted-foreground',
          )}
        >
          {item.kind === 'topic' && item.color && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
          )}
          <span className="truncate">{item.name}</span>
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          title={hidden.map((h) => h.name).join(', ')}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground ring-1 ring-inset ring-border"
        >
          +{hidden.length}
        </span>
      )}
    </div>
  );
}
