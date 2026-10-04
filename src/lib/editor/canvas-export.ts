import type { PDFDocumentProxy } from "pdfjs-dist";
import { boundsForPages, type Bounds } from "./geometry";
import { canvasToImageBytes, drawAnnotations, renderEditorPageCanvas } from "./raster-export";
import type { Annotation, EditorState } from "./types";

export function annotationBounds(annotation: Annotation): Bounds | null {
  if (annotation.pageId !== null) return null;
  if (annotation.type === "ink" || annotation.type === "highlight") {
    if (!annotation.points.length) return null;
    const padding = annotation.size / 2;
    const left = Math.min(...annotation.points.map((point) => point[0])) - padding;
    const top = Math.min(...annotation.points.map((point) => point[1])) - padding;
    const right = Math.max(...annotation.points.map((point) => point[0])) + padding;
    const bottom = Math.max(...annotation.points.map((point) => point[1])) + padding;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  if ("x" in annotation) {
    return { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height };
  }
  return null;
}

export function boundsForCanvasContent(state: EditorState): Bounds | null {
  const annotationItems = state.annotations.flatMap((annotation) => {
    const bounds = annotationBounds(annotation);
    return bounds ? [bounds] : [];
  });
  return boundsForPages([
    ...state.pages.map(({ x, y, width, height }) => ({ x, y, width, height })),
    ...annotationItems,
  ]);
}

export async function exportCanvasImage(
  state: EditorState,
  documents: Map<string, PDFDocumentProxy>,
  format: "png" | "jpeg" = "png",
  region?: Bounds,
  signal?: AbortSignal,
) {
  const contentBounds = region ?? boundsForCanvasContent(state);
  if (!contentBounds) throw new Error("El espacio está vacío.");
  const padding = region ? 0 : 48;
  const bounds = {
    x: contentBounds.x - padding,
    y: contentBounds.y - padding,
    width: contentBounds.width + padding * 2,
    height: contentBounds.height + padding * 2,
  };
  const requestedScale = 2;
  const maxDimensionScale = 14_000 / Math.max(bounds.width, bounds.height);
  const maxAreaScale = Math.sqrt(56_000_000 / Math.max(1, bounds.width * bounds.height));
  const scale = Math.min(requestedScale, maxDimensionScale, maxAreaScale);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(bounds.width * scale));
  canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("No se pudo preparar la imagen del lienzo.");
  context.fillStyle = "#f5f5f2";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const page of [...state.pages].sort((a, b) => a.order - b.order)) {
    signal?.throwIfAborted();
    const radius = Math.hypot(page.width, page.height) / 2;
    const cx = page.x + page.width / 2, cy = page.y + page.height / 2;
    if (cx + radius < bounds.x || cx - radius > bounds.x + bounds.width || cy + radius < bounds.y || cy - radius > bounds.y + bounds.height) continue;
    const rendered = await renderEditorPageCanvas(state, documents, page, scale, { signal });
    if (!rendered) continue;
    const centerX = (page.x + page.width / 2 - bounds.x) * scale;
    const centerY = (page.y + page.height / 2 - bounds.y) * scale;
    context.drawImage(rendered, centerX - rendered.width / 2, centerY - rendered.height / 2);
    rendered.width = 0; rendered.height = 0;
  }

  context.save();
  context.translate(-bounds.x * scale, -bounds.y * scale);
  drawAnnotations(context, state.annotations.filter((annotation) => annotation.pageId === null), 0, scale);
  context.restore();
  signal?.throwIfAborted();
  const result = await canvasToImageBytes(canvas, format === "png" ? "image/png" : "image/jpeg", format === "jpeg" ? 0.9 : undefined);
  canvas.width = 0; canvas.height = 0;
  return result;
}
