// One-off codemod that moves hard-coded Tailwind palette classes onto the semantic theme tokens
// (see tailwind.config.js / src/index.css). The light-mode value of every token equals the slate shade it replaces,
// so light mode stays visually identical; dark mode comes from the `.dark` variable set.
//
//   node scripts/theme-codemod.mjs            # rewrite src/**/*.{ts,tsx} in place
//   node scripts/theme-codemod.mjs --check    # list files that would change, exit 1 if any
//
// Rules are exported so they can be unit-tested (scripts/theme-codemod.test.mjs).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const COLORS = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PROPS = 'bg|text|border|ring|divide|fill|stroke|from|to|via|shadow|decoration|outline|placeholder|caret|accent';

/** slate shade -> semantic token name, per property family. Shades not listed (e.g. slate-800/900 backgrounds) stay. */
export const SLATE_MAP = {
  bg: { 50: 'subtle', 100: 'muted', 200: 'border', 300: 'fg-ghost', 400: 'fg-faint', 500: 'muted-foreground' },
  text: {
    950: 'foreground', 900: 'foreground', 800: 'foreground', 700: 'fg-body', 600: 'fg-soft',
    500: 'muted-foreground', 400: 'fg-faint', 300: 'fg-ghost',
  },
  border: { 50: 'hairline', 100: 'hairline', 200: 'border', 300: 'fg-ghost', 400: 'fg-faint', 500: 'muted-foreground' },
  divide: { 50: 'hairline', 100: 'hairline', 200: 'border' },
  ring: { 100: 'hairline', 200: 'border' },
  fill: { 100: 'muted', 200: 'border' },
  placeholder: { 400: 'fg-faint', 500: 'muted-foreground' },
};

/** For coloured accents: shade -> dark-mode companion (the light class is kept as is). */
export const DARK_COMPANION = {
  bg: { 50: (c) => `bg-${c}-500/10`, 100: (c) => `bg-${c}-500/20`, 200: (c) => `bg-${c}-500/30` },
  text: {
    600: (c) => `text-${c}-400`, 700: (c) => `text-${c}-300`, 800: (c) => `text-${c}-300`, 900: (c) => `text-${c}-200`,
  },
  border: { 100: (c) => `border-${c}-500/20`, 200: (c) => `border-${c}-500/30`, 300: (c) => `border-${c}-500/40` },
};

const TOKEN = new RegExp(
  '(?<![\\w:/\\[-])((?:(?:[a-z0-9-]+|\\[[^\\]\\s]+\\]):)*)(' + PROPS + ')-(slate|white|black|' + COLORS +
    ')(?:-(\\d{2,3}))?(\\/\\d{1,3})?(?![\\w-])',
  'g',
);

function mapNeutral(variants, prop, color, shade, alpha) {
  if (color === 'white') {
    // white surfaces only; text-white / border-white / ring-white are deliberate contrast colours and stay
    return prop === 'bg' ? variants + 'bg-background' + alpha : null;
  }
  if (color === 'black' || shade === undefined) return null;
  const name = SLATE_MAP[prop] && SLATE_MAP[prop][Number(shade)];
  return name ? variants + prop + '-' + name + alpha : null;
}

/** Rewrite all palette classes in a chunk of source text. */
export function transformClassText(text) {
  return text.replace(TOKEN, (match, variants, prop, color, shade, alpha = '', offset, whole) => {
    if (color === 'slate' || color === 'white' || color === 'black') {
      const mapped = mapNeutral(variants, prop, color, shade, alpha);
      return mapped === null ? match : mapped;
    }
    // coloured accent: keep the light class, add a dark companion unless the author already wrote one
    const make = DARK_COMPANION[prop] && DARK_COMPANION[prop][Number(shade)];
    if (!make || alpha) return match; // translucent tints already read fine on dark surfaces
    if (variants.split(':').includes('dark')) return match;
    const lineStart = whole.lastIndexOf('\n', offset) + 1;
    const lineEnd = whole.indexOf('\n', offset);
    const line = whole.slice(lineStart, lineEnd === -1 ? whole.length : lineEnd);
    if (line.includes('dark:' + variants + prop + '-')) return match;
    return match + ' dark:' + variants + make(color);
  });
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const check = process.argv.includes('--check');
  const skip = (process.env.CODEMOD_SKIP || '').split(',').filter(Boolean);
  let changed = 0;
  for (const file of walk(join(root, 'src'))) {
    const rel = relative(root, file).replace(/\\/g, '/');
    if (skip.some((s) => rel.includes(s))) continue;
    const before = readFileSync(file, 'utf8');
    const after = transformClassText(before);
    if (after !== before) {
      changed++;
      console.log((check ? 'would change ' : 'changed ') + rel);
      if (!check) writeFileSync(file, after);
    }
  }
  console.log(changed + ' file(s) ' + (check ? 'would change' : 'changed'));
  if (check && changed) process.exit(1);
}
