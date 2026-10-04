import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Annotation, EditorState } from "./types";
import { plannedPages, assertExportSources, exportCheckpoint, type ExportOptions, type RasterOutputPage } from "./export-task";
import { outputWorker } from "./output-worker-client";
import { sourcePageFrame } from "./crop";
import { boardAnnotationsForPage } from "./board-projection";

export type RasterProfile = "balanced" | "compact";

const profiles = {
  balanced: { scale: 1.5, quality: 0.78 },
  compact: { scale: 1, quality: 0.58 },
} as const;

export function drawAnnotations(
  context: CanvasRenderingContext2D,
  annotations: Annotation[],
  pageHeight: number,
  scale: number,
) {
  context.save();
  context.scale(scale, scale);
  for (const annotation of annotations) {
    context.globalAlpha = annotation.opacity;
    context.strokeStyle = annotation.color;
    context.fillStyle = annotation.color;
    if (annotation.type === "ink" || annotation.type === "highlight") {
      context.lineCap = "round";
      context.lineJoin = "round";
      for (let index = 1; index < annotation.points.length; index += 1) {
        const previous = annotation.points[index - 1];
        const current = annotation.points[index];
        const pressure = annotation.pressureEnabled === false ? 0.5 : (previous[2] + current[2]) / 2 || 0.5;
        context.lineWidth = annotation.size * (0.5 + pressure);
        context.beginPath();
        context.moveTo(previous[0], previous[1]);
        context.lineTo(current[0], current[1]);
        context.stroke();
      }
    } else if (annotation.type === "text") {
      const fontSize = annotation.fontSize ?? 16;
      context.font = `${fontSize}px ui-sans-serif, sans-serif`;
      context.textBaseline = "top";
      context.fillText(annotation.text, annotation.x, annotation.y, annotation.width);
    } else if (annotation.type === "rectangle") {
      context.lineWidth = annotation.size ?? 2;
      if (annotation.fillColor) {
        context.save();
        context.fillStyle = annotation.fillColor;
        context.globalAlpha = annotation.fillOpacity ?? annotation.opacity;
        context.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
        context.restore();
      }
      context.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
    } else if (annotation.type === "replacement") {
      context.save();
      context.globalAlpha = 1;
      context.fillStyle = annotation.backgroundColor;
      context.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
      if (annotation.text.trim()) {
        context.globalAlpha = annotation.opacity;
        context.fillStyle = annotation.color;
        context.font = `${annotation.fontSize}px ui-sans-serif, sans-serif`;
        context.textBaseline = "top";
        context.fillText(annotation.text, annotation.x, annotation.y, annotation.width);
      }
      context.restore();
    }
  }
  context.restore();
}

export function rotateCanvas(source: HTMLCanvasElement, rotation: number) {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 0) return source;
  const swap = normalized === 90 || normalized === 270;
  const output = document.createElement("canvas");
  output.width = swap ? source.height : source.width;
  output.height = swap ? source.width : source.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la compresión.");
  context.translate(output.width / 2, output.height / 2);
  context.rotate((normalized * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return output;
}

export function canvasToImageBytes(canvas: HTMLCanvasElement, mimeType: "image/jpeg" | "image/png", quality?: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error("No se pudo comprimir una página."));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, mimeType, quality);
  });
}

export async function renderEditorPageCanvas(
  state: EditorState,
  documents: Map<string, PDFDocumentProxy>,
  item: EditorState["pages"][number],
  scale: number,
  options: ExportOptions = {},
) {
  await exportCheckpoint(options.signal);
  const documentProxy = documents.get(item.sourceId);
  if (!documentProxy) throw new Error("Falta el documento original de una página.");
  const page = await documentProxy.getPage(item.sourcePageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("No se pudo renderizar una página.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas, canvasContext: context, viewport });
  const cancel = () => task.cancel();
  options.signal?.addEventListener("abort", cancel, { once: true });
  try { await task.promise; options.signal?.throwIfAborted(); }
  catch (error) { canvas.width = 0; canvas.height = 0; throw error; }
  finally { options.signal?.removeEventListener("abort", cancel); }
  drawAnnotations(context, [
    ...state.annotations.filter((annotation) => annotation.pageId === item.id),
    ...(options.includeBoard ? boardAnnotationsForPage(state.annotations, sourcePageFrame(item)) : []),
  ], item.height, scale);
  let visual = canvas;
  if (item.crop) {
    visual = document.createElement("canvas"); visual.width = Math.max(1, Math.ceil(item.crop.width * scale)); visual.height = Math.max(1, Math.ceil(item.crop.height * scale));
    visual.getContext("2d")?.drawImage(canvas, item.crop.x * scale, item.crop.y * scale, item.crop.width * scale, item.crop.height * scale, 0, 0, visual.width, visual.height);
    canvas.width = 0; canvas.height = 0;
  }
  const rotated = rotateCanvas(visual, item.rotation);
  if (rotated !== visual) { visual.width = 0; visual.height = 0; }
  if (rotated !== canvas) { canvas.width = 0; canvas.height = 0; }
  return rotated;
}

export async function exportRasterPdf(
  state: EditorState,
  documents: Map<string, PDFDocumentProxy>,
  profile: RasterProfile,
  onProgress?: (progress: number) => void,
  groupId: string | null = null,
  options: ExportOptions = {},
) {
  const settings = profiles[profile];
  const ordered = plannedPages(state, groupId, options);
  assertExportSources(ordered, documents.keys());
  const pages: RasterOutputPage[] = [];
  const replaced = new Set(state.annotations.flatMap((annotation) => annotation.type === "replacement" ? [annotation.sourceTextBlockId] : []));
  for (let index = 0; index < ordered.length; index++) {
    await exportCheckpoint(options.signal);
    const item = ordered[index];
    const canvas = await renderEditorPageCanvas(state, documents, item, settings.scale, options);
    try {
      pages.push({ bytes: await canvasToImageBytes(canvas, "image/jpeg", settings.quality), width: canvas.width / settings.scale, height: canvas.height / settings.scale,
        blocks: item.rotation % 360 === 0 ? state.textBlocks.filter((block) => block.pageId === item.id && !replaced.has(block.id) && (!item.crop || (block.x >= item.crop.x && block.y >= item.crop.y && block.x + block.width <= item.crop.x + item.crop.width && block.y + block.height <= item.crop.y + item.crop.height))).map((block) => ({ ...block, x: block.x - (item.crop?.x ?? 0), y: block.y - (item.crop?.y ?? 0) })) : [] });
    } finally { canvas.width = 0; canvas.height = 0; }
    onProgress?.((index + 1) / ordered.length * 0.9);
  }
  return outputWorker({ kind: "raster", pages }, options.signal);
}
