import { toPng } from 'html-to-image';

// Browsers cap canvases (Chrome/Edge ~16k px per side, ~268M px in area); stay well below.
const MAX_SIDE = 16000;
const MAX_AREA = 120_000_000;

/** 2x for normal charts; 1x (CSS pixels) for very large ones, where 2x mostly costs time (and the image is huge). */
export function preferredRatio(width: number, height: number): number {
  return width * height <= 6_000_000 ? 2 : 1;
}

/** Pixel ratio that keeps a width x height capture inside the canvas limits (at most `preferred`). */
export function safePixelRatio(width: number, height: number, preferred = preferredRatio(width, height)): number {
  if (width <= 0 || height <= 0) return 1;
  const bySide = MAX_SIDE / Math.max(width, height);
  const byArea = Math.sqrt(MAX_AREA / (width * height));
  return Math.max(0.25, Math.min(preferred, bySide, byArea));
}

/**
 * Save the WHOLE content of `node` as a PNG, including what is scrolled out of view.
 * Pass the full-size content element (not its scrolling container): it is rendered at its scroll size, so
 * sticky headers and the task column appear once, in place.
 */
export async function exportFullElement(node: HTMLElement, filename: string): Promise<{ width: number; height: number }> {
  // Let the caller's "preparing" state paint before the (main-thread heavy) capture starts.
  await new Promise((resolve) => setTimeout(resolve, 60));
  const width = Math.ceil(node.scrollWidth);
  const height = Math.ceil(node.scrollHeight);
  const background = getComputedStyle(node).backgroundColor;
  const dataUrl = await toPng(node, {
    backgroundColor: background && background !== 'rgba(0, 0, 0, 0)' ? background : getComputedStyle(document.body).backgroundColor,
    width,
    height,
    pixelRatio: safePixelRatio(width, height),
    cacheBust: false,
    // Embedding every web font on the page (Excalidraw alone ships megabytes of them) is what made big exports
    // take most of a minute; the chart uses the system UI font, which needs no embedding.
    skipFonts: true,
    style: { overflow: 'visible', width: `${width}px`, height: `${height}px`, maxWidth: 'none', maxHeight: 'none', transform: 'none' },
  });
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return { width, height };
}
