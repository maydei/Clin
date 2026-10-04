import type { EditorPage, EditorState, DocumentTextBlock } from "./types";
import { orderedPagesForExport } from "./model";

export type ExportOptions = { includeBoard?: boolean; pageIds?: string[]; orderedIds?: string[]; signal?: AbortSignal };
export function plannedPages(state: EditorState, groupId: string | null, options: ExportOptions): EditorPage[] {
  if (!options.orderedIds) return orderedPagesForExport(state, groupId, options.pageIds);
  const byId = new Map(state.pages.map((page) => [page.id, page]));
  return [...new Set(options.orderedIds)].map((id) => {
    const page = byId.get(id);
    if (!page) throw new Error("La revisión de exportación no contiene todas las páginas.");
    return page;
  });
}
export async function exportCheckpoint(signal?: AbortSignal) {
  signal?.throwIfAborted();
  await new Promise((resolve) => setTimeout(resolve, 0));
  signal?.throwIfAborted();
}
export type RasterOutputPage = { bytes: Uint8Array; width: number; height: number; blocks: DocumentTextBlock[] };

/** Validate the whole scope before rendering or writing any output. */
export function assertExportSources(pages: EditorPage[], availableIds: Iterable<string>) {
  const available = new Set(availableIds);
  const missing = pages.filter((page) => !available.has(page.sourceId));
  if (missing.length) {
    const labels = [...new Set(missing.map((page) => page.name || page.id))];
    throw new Error(`No se puede exportar: faltan originales para estas páginas: ${labels.join(", ")}. Vuelve a abrir un proyecto que incluya estos documentos o importa los originales y sustituye las páginas afectadas.`);
  }
}
