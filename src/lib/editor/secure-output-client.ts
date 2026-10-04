import type { PdfProtectionOptions, PdfSignatureOptions } from "./secure-export";
function run(operation: "protect" | "sign", bytes: Uint8Array, options: PdfProtectionOptions | PdfSignatureOptions, signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Cancelado", "AbortError")); return; }
    const worker = new Worker(new URL("./secure-output-worker.ts", import.meta.url));
    const cleanup = () => { worker.terminate(); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new DOMException("Cancelado", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { cleanup(); if (data.error) reject(new Error(data.error)); else resolve(data.bytes); };
    worker.onerror = () => { cleanup(); reject(new Error("No se pudo completar la operación del PDF.")); };
    worker.postMessage({ operation, bytes, options });
  });
}
export const protectPdf = (bytes: Uint8Array, options: PdfProtectionOptions, signal?: AbortSignal) => run("protect", bytes, options, signal);
export const signPdf = (bytes: Uint8Array, options: PdfSignatureOptions, signal?: AbortSignal) => run("sign", bytes, options, signal);
