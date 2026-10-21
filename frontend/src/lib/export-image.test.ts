import { describe, expect, it } from 'vitest';
import { preferredRatio, safePixelRatio } from './export-image';

describe('safePixelRatio', () => {
  it('keeps the preferred ratio for normal charts', () => {
    expect(safePixelRatio(3000, 1200)).toBe(2);
  });
  it('scales down very wide charts to stay under the canvas side limit', () => {
    const r = safePixelRatio(20000, 900);
    expect(20000 * r).toBeLessThanOrEqual(16000);
  });
  it('scales down huge areas', () => {
    const r = safePixelRatio(12000, 12000);
    expect(12000 * 12000 * r * r).toBeLessThanOrEqual(120_000_000 + 1);
  });
  it('drops to 1x for very large charts', () => {
    expect(preferredRatio(6752, 1569)).toBe(1);
    expect(safePixelRatio(6752, 1569)).toBe(1);
  });
  it('never returns less than a quarter', () => {
    expect(safePixelRatio(400000, 400000)).toBe(0.25);
  });
});
