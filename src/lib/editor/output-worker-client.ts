import type { EditorState, DocumentSource } from "./types";
import type { ExportOptions, RasterOutputPage } from "./export-task";
export function outputWorker(input: { kind: "editable"; state: EditorState; sources: DocumentSource[]; options: Omit<ExportOptions, "signal"> } | { kind: "raster"; pages: RasterOutputPage[] }, signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Cancelado", "AbortError")); return; }
    const worker = new Worker(new URL("./pdf-output-worker.ts", import.meta.url));
    const cleanup = () => { worker.terminate(); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new DOMException("Cancelado", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { cleanup(); if (data.error) reject(new Error(data.error)); else resolve(data.bytes); };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "No se pudo generar el PDF.")); };
    worker.postMessage(input, input.kind === "raster" ? input.pages.map((page) => page.bytes.buffer as ArrayBuffer) : []);
  });
}
