import { describe, expect, it } from 'vitest';
import { transformClassText as t } from './theme-codemod.mjs';

describe('theme codemod: slate and white -> semantic tokens', () => {
  it('maps surfaces', () => {
    expect(t('bg-white bg-slate-50 bg-slate-100')).toBe('bg-background bg-subtle bg-muted');
  });
  it('maps the text scale', () => {
    expect(t('text-slate-900 text-slate-700 text-slate-600 text-slate-500 text-slate-400 text-slate-300')).toBe(
      'text-foreground text-fg-body text-fg-soft text-muted-foreground text-fg-faint text-fg-ghost',
    );
  });
  it('maps borders and dividers', () => {
    expect(t('border-slate-200 border-slate-100 divide-slate-100')).toBe('border-border border-hairline divide-hairline');
  });
  it('keeps variants and opacity', () => {
    expect(t('hover:bg-slate-50/50 md:hover:text-slate-900 bg-white/90')).toBe(
      'hover:bg-subtle/50 md:hover:text-foreground bg-background/90',
    );
  });
  it('leaves deliberate contrast colours alone', () => {
    const keep = 'text-white border-white ring-white bg-slate-800 bg-slate-900 text-slate-100 bg-black/40';
    expect(t(keep)).toBe(keep);
  });
  it('is idempotent', () => {
    const once = t('bg-white text-slate-500 border-slate-200 bg-blue-50 text-blue-700');
    expect(t(once)).toBe(once);
  });
  it('does not touch identifiers that merely contain the pattern', () => {
    const keep = 'const bgwhite = "abg-white"; // sub-bg-slate-50';
    expect(t(keep)).toBe(keep);
  });
});

describe('theme codemod: coloured accents get a dark companion', () => {
  it('adds dark variants next to light tints', () => {
    expect(t('bg-blue-50 text-blue-700 border-blue-200')).toBe(
      'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
    );
  });
  it('carries state variants over', () => {
    expect(t('hover:bg-red-50')).toBe('hover:bg-red-50 dark:hover:bg-red-500/10');
  });
  it('does not duplicate an existing dark class on the line', () => {
    const keep = 'bg-red-50 dark:bg-red-950';
    expect(t(keep)).toBe(keep);
  });
  it('leaves saturated and translucent colours alone', () => {
    const keep = 'bg-blue-500 text-red-500 bg-blue-50/50 border-green-500';
    expect(t(keep)).toBe(keep);
  });
});
