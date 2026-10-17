import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';
import { nextPreference, THEME_LABELS, THEME_PREFERENCES, type ThemePreference } from '@/lib/theme';

const ICONS: Record<ThemePreference, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

/** Header button: cycles system -> light -> dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const Icon = ICONS[preference];
  const next = nextPreference(preference);
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('text-muted-foreground hover:text-foreground', className)}
      aria-label={`Theme: ${THEME_LABELS[preference]}. Switch to ${THEME_LABELS[next]}`}
      title={`Theme: ${THEME_LABELS[preference]} (click for ${THEME_LABELS[next]})`}
      onClick={() => setPreference(next)}
    >
      <Icon className="w-5 h-5" aria-hidden />
    </Button>
  );
}

/** Settings: the three choices side by side. */
export function ThemeSegmented() {
  const { preference, setPreference } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border bg-subtle p-1 gap-1">
      {THEME_PREFERENCES.map((p) => {
        const Icon = ICONS[p];
        const active = p === preference;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(p)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="w-4 h-4" aria-hidden />
            {THEME_LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}
