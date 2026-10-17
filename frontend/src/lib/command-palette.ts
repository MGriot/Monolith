export type CommandSection = 'Navigate' | 'Actions' | 'Results';

export interface PaletteCommand {
  id: string;
  title: string;
  section: CommandSection;
  /** extra words that also match, e.g. "board" for the kanban toggle */
  keywords?: string[];
  hint?: string;
  /** what to do on select; kept as data so this module stays free of React/router */
  run:
    | { type: 'navigate'; to: string }
    | { type: 'event'; name: string }
    | { type: 'create-task' }
    | { type: 'help' };
}

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  description?: string | null;
  link: string;
}

/**
 * Subsequence-aware score: higher is better, null = no match.
 * Exact > prefix > word-start > substring > scattered subsequence.
 */
export function scoreMatch(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.split(/[\s/_-]+/).some((w) => w.startsWith(q))) return 80;
  if (t.includes(q)) return 70;
  let ti = 0;
  for (const ch of q) {
    ti = t.indexOf(ch, ti);
    if (ti < 0) return null;
    ti++;
  }
  return 40;
}

export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  if (!query.trim()) return commands;
  return commands
    .map((c, i) => {
      const scores = [c.title, ...(c.keywords ?? [])]
        .map((s, k) => {
          const sc = scoreMatch(query, s);
          return sc === null ? null : k === 0 ? sc : sc - 10; // title beats keyword
        })
        .filter((s): s is number => s !== null);
      return { c, i, score: scores.length ? Math.max(...scores) : null };
    })
    .filter((x): x is { c: PaletteCommand; i: number; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.c);
}

/** Server search hits become palette entries that navigate to the hit's link. */
export function hitsToCommands(hits: SearchHit[]): PaletteCommand[] {
  return hits.map((h) => ({
    id: `hit-${h.type}-${h.id}`,
    title: h.title,
    section: 'Results',
    hint: h.type,
    run: { type: 'navigate', to: h.link },
  }));
}

const SECTION_ORDER: CommandSection[] = ['Actions', 'Navigate', 'Results'];

/** Flat, ordered list the palette renders (headings are derived from `section` changes). */
export function buildPaletteItems(local: PaletteCommand[], hits: SearchHit[], query: string): PaletteCommand[] {
  const all = [...filterCommands(local, query), ...hitsToCommands(hits)];
  return SECTION_ORDER.flatMap((s) => all.filter((c) => c.section === s));
}

/** Wraps an index into [0, length); -1 when empty. Used for ArrowUp/ArrowDown. */
export function moveIndex(current: number, delta: 1 | -1, length: number): number {
  if (length <= 0) return -1;
  return (current + delta + length) % length;
}
