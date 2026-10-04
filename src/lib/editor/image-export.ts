import { zipFiles } from "./async-zip";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { plannedPages, assertExportSources, exportCheckpoint, type ExportOptions } from "./export-task";
import { canvasToImageBytes, renderEditorPageCanvas } from "./raster-export";
import type { EditorState } from "./types";

const safePart = (value: string) => value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "página";

export async function exportPageImage(
  state: EditorState,
  documents: Map<string, PDFDocumentProxy>,
  pageId: string,
  format: "jpeg" | "png",
  options: ExportOptions = {},
) {
  const page = state.pages.find((item) => item.id === pageId);
  if (!page) throw new Error("La página seleccionada ya no está disponible.");
  assertExportSources([page], documents.keys());
  const canvas = await renderEditorPageCanvas(state, documents, page, 1.5, options);
  if (!canvas) throw new Error("No se pudo renderizar la página seleccionada.");
  try { return await canvasToImageBytes(canvas, format === "jpeg" ? "image/jpeg" : "image/png", format === "jpeg" ? 0.84 : undefined); }
  finally { canvas.width = 0; canvas.height = 0; }
}

export async function exportPageImages(
  state: EditorState,
  documents: Map<string, PDFDocumentProxy>,
  groupId: string | null,
  format: "jpeg" | "png" = "jpeg",
  onProgress?: (progress: number) => void,
  options: ExportOptions = {},
) {
  const pages = plannedPages(state, groupId, options);
  assertExportSources(pages, documents.keys());
  const files: Record<string, Uint8Array> = {};
  const extension = format === "jpeg" ? "jpg" : "png";
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const digits = Math.max(2, String(pages.length).length);

  for (let index = 0; index < pages.length; index += 1) {
    await exportCheckpoint(options.signal);
    const page = pages[index];
    const canvas = await renderEditorPageCanvas(state, documents, page, 1.5, options);
    if (!canvas) continue;
    const filename = `${String(index + 1).padStart(digits, "0")}-${safePart(page.name)}.${extension}`;
    files[filename] = await canvasToImageBytes(canvas, mimeType, format === "jpeg" ? 0.84 : undefined);
    canvas.width = 0; canvas.height = 0;
    onProgress?.((index + 1) / pages.length);
  }
  return zipFiles(files, options.signal);
}
