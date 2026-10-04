"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cachedPageRaster, renderPage } from "@/lib/editor/render-scheduler";
import { ExternalLink, LoaderCircle } from "lucide-react";

type PdfPageViewProps = {
  document: PDFDocumentProxy | undefined;
  pageIndex: number;
  width: number;
  height: number;
  zoom?: number;
  className?: string;
};

export const PdfPageView = memo(function PdfPageView({
  document,
  pageIndex,
  width,
  height,
  zoom = 1,
  className,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendered = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [renderZoom, setRenderZoom] = useState(zoom);
  const [links, setLinks] = useState<Array<{ url: string; x: number; y: number; width: number; height: number }>>([]);

  useLayoutEffect(() => {
    rendered.current = false;
    const raster = document && cachedPageRaster(document, pageIndex);
    const canvas = canvasRef.current;
    if (raster && canvas) {
      canvas.width = raster.width; canvas.height = raster.height;
      canvas.getContext("2d", { alpha: false })?.drawImage(raster, 0, 0);
      rendered.current = true;
      setLoading(false);
    }
  }, [document, pageIndex]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setRenderZoom(Math.round(zoom * 4) / 4), 140);
    return () => window.clearTimeout(timeout);
  }, [zoom]);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    const controller = new AbortController();
    const signal = controller.signal;
    setLoading(true);
    setFailed(false);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(2.4, Math.max(0.08, renderZoom * pixelRatio));
    void renderPage(document, pageIndex, scale, signal).then((raster) => {
      if (signal.aborted || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = raster.width;
      canvas.height = raster.height;
      canvas.getContext("2d", { alpha: false })?.drawImage(raster, 0, 0);
      rendered.current = true;
      setLoading(false);
    }).catch((error) => {
      if (signal.aborted || error?.name === "RenderingCancelledException") return;
      setFailed(true);
      setLoading(false);
    });
    return () => controller.abort();
  }, [document, pageIndex, renderZoom]);

  useEffect(() => {
    setLinks([]);
    if (!document) return;
    let cancelled = false;
    void document.getPage(pageIndex + 1).then(async (page) => {
      const viewport = page.getViewport({ scale: 1 });
      const annotations = await page.getAnnotations({ intent: "display" });
      if (cancelled) return;
      setLinks(annotations.flatMap((value) => {
        const annotation = value as { subtype?: string; url?: string; rect?: number[] };
        if (annotation.subtype !== "Link" || !annotation.url || !annotation.rect) return [];
        const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
        return [{ url: annotation.url, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2-x1), height: Math.abs(y2-y1) }];
      }));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [document, pageIndex]);

  return (
    <div className={className} style={{ width, height }} data-rendered={!loading && !failed ? "true" : "false"}>
      <canvas ref={canvasRef} className="block h-full w-full bg-white" />
      {links.map((link, index) => (
        <a
          key={`${link.url}-${index}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir enlace ${link.url}`}
          className="group/link absolute z-20 grid place-items-center rounded-[2px] outline outline-1 outline-transparent hover:bg-primary/15 hover:outline-primary focus-visible:bg-primary/15 focus-visible:outline-primary"
          style={{ left: link.x, top: link.y, width: link.width, height: link.height }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="size-3 text-neutral-800 opacity-0 drop-shadow-sm group-hover/link:opacity-100 group-focus-visible/link:opacity-100" />
        </a>
      ))}
      {loading && !rendered.current && (
        <div className="absolute inset-0 grid place-items-center bg-white">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-white px-6 text-center text-xs text-destructive">
          No se pudo mostrar esta página.
        </div>
      )}
    </div>
  );
});
