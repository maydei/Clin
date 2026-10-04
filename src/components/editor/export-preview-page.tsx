"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { EditorState, EditorPage } from "@/lib/editor/types";
import { renderEditorPageCanvas } from "@/lib/editor/raster-export";
import { scheduleRender } from "@/lib/editor/render-scheduler";

export function ExportPreviewPage({ state, page, documents, includeBoard }: { state: EditorState; page: EditorPage; documents: Map<string, PDFDocumentProxy>; includeBoard: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    void scheduleRender(async () => {
      const canvas = await renderEditorPageCanvas(state, documents, page, Math.min(0.4, 180 / Math.max(page.width, page.height)), { includeBoard, signal: controller.signal });
      try {
        if (!ref.current || controller.signal.aborted) return;
        ref.current.width = canvas.width; ref.current.height = canvas.height;
        ref.current.getContext("2d")?.drawImage(canvas, 0, 0);
      } finally { canvas.width = 0; canvas.height = 0; }
    }, controller.signal, 0).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [state, page, documents, includeBoard]);
  return error ? <span className="text-xs text-destructive">Vista previa no disponible</span> : <canvas ref={ref} className="h-full w-full object-contain" />;
}
