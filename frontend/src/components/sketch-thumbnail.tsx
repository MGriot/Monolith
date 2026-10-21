import { useEffect, useState } from 'react';
import { PenTool } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A saved sketch's preview image (PNG from the editor or SVG rendered by the server), falling back to an icon. */
export function SketchThumbnail({ src, className, iconClassName }: { src?: string | null; className?: string; iconClassName?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <div className={cn('flex items-center justify-center overflow-hidden rounded-md bg-white', !src || broken ? 'bg-subtle' : '', className)}>
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-contain" />
      ) : (
        <PenTool className={cn('h-7 w-7 text-fg-ghost', iconClassName)} aria-hidden />
      )}
    </div>
  );
}

type SceneFile = { elements?: unknown[]; files?: Record<string, unknown>; appState?: Record<string, unknown> };

/** Parse an .excalidraw document (or a whiteboard `data` object) into something exportToSvg accepts. */
export function parseScene(raw: unknown): SceneFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const scene = raw as SceneFile;
  if (!Array.isArray(scene.elements)) return null;
  return { elements: scene.elements, files: scene.files ?? {}, appState: scene.appState ?? {} };
}

/** Renders an Excalidraw scene to inline SVG in the browser. The Excalidraw bundle loads only when this mounts. */
export function ExcalidrawScenePreview({ url, scene, className }: { url?: string; scene?: unknown; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    (async () => {
      try {
        const source = scene ?? (url ? await (await fetch(url)).json() : null);
        const parsed = parseScene(source);
        if (!parsed) throw new Error('not an Excalidraw scene');
        const { exportToSvg } = await import('@excalidraw/excalidraw');
        const node = await exportToSvg({
          elements: parsed.elements as never,
          files: parsed.files as never,
          appState: { exportBackground: true, viewBackgroundColor: '#ffffff', exportWithDarkMode: false },
          exportPadding: 16,
        });
        // Shown through <img>, so nothing in an uploaded scene (links, embedded markup) can run in the app origin.
        const blobUrl = URL.createObjectURL(new Blob([node.outerHTML], { type: 'image/svg+xml' }));
        if (cancelled) URL.revokeObjectURL(blobUrl);
        else setSvg(blobUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url, scene]);

  useEffect(() => () => { if (svg) URL.revokeObjectURL(svg); }, [svg]);

  if (failed || !svg) {
    return (
      <div className={cn('flex items-center justify-center rounded-md bg-subtle', className)}>
        <PenTool className={cn('h-7 w-7 text-fg-ghost', !failed && 'animate-pulse')} aria-hidden />
      </div>
    );
  }
  return (
    <div className={cn('overflow-hidden rounded-md bg-white', className)}>
      <img src={svg} alt="" draggable={false} className="h-full w-full object-contain" />
    </div>
  );
}
