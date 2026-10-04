import type { PDFDocumentProxy } from "pdfjs-dist";
import { plannedPages, assertExportSources, exportCheckpoint, type ExportOptions } from "./export-task";
import { renderEditorPageCanvas } from "./raster-export";
import type { EditorState } from "./types";

export async function printEditorPages(
  state: EditorState,
  documents: Map<string, PDFDocumentProxy>,
  groupId: string | null,
  options: ExportOptions = {},
) {
  const pages = plannedPages(state, groupId, options);
  assertExportSources(pages, documents.keys());
  const printWindow = window.open("", "_blank", "popup");
  if (!printWindow) throw new Error("El navegador ha bloqueado la ventana de impresión.");
  printWindow.document.write("<!doctype html><title>Preparando impresión</title><p style='font:14px system-ui'>Preparando páginas…</p>");

  try {
    const images: string[] = [];
    for (const page of pages) {
      const canvas = await renderEditorPageCanvas(state, documents, page, 2, options);
      if (canvas) { images.push(canvas.toDataURL("image/png")); canvas.width = 0; canvas.height = 0; }
    }
    if (!images.length) throw new Error("No hay páginas disponibles para imprimir.");
    options.signal?.throwIfAborted();
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><title>Imprimir PDF</title><style>
      @page { margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; background: white; }
      img { display: block; width: 100%; height: auto; break-after: page; page-break-after: always; }
      img:last-child { break-after: auto; page-break-after: auto; }
    </style></head><body>${images.map((source) => `<img src="${source}" alt="">`).join("")}
    <script>window.addEventListener("load",()=>setTimeout(()=>{window.focus();window.print()},120));<\/script></body></html>`);
    printWindow.document.close();
  } catch (error) {
    printWindow.close();
    throw error;
  }
}
