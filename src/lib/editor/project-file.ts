import { recordDuration } from "./performance-log";
import type { EditorProject } from "./types";
export { encodeProject, decodeProject } from "./project-codec";

function runCodec<T>(operation: "encode" | "decode", value: EditorProject | Uint8Array, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Cancelado", "AbortError")); return; }
    const startedAt = performance.now();
    const worker = new Worker(new URL("./project-worker.ts", import.meta.url));
    const cleanup = () => { worker.terminate(); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new DOMException("Cancelado", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      cleanup();
      if (data.error) reject(new Error(data.error)); else { recordDuration(operation === "encode" ? "project-encode" : "project-decode", startedAt); resolve(data.value as T); }
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "No se pudo procesar el proyecto.")); };
    worker.postMessage({ operation, value });
  });
}

export const encodeProjectAsync = (project: EditorProject, signal?: AbortSignal) => runCodec<Uint8Array>("encode", project, signal);
export const decodeProjectAsync = (bytes: Uint8Array, signal?: AbortSignal) => runCodec<EditorProject>("decode", bytes, signal);
