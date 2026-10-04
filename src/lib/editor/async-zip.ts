import { zip } from "fflate";
export function zipFiles(files: Record<string, Uint8Array>, signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Cancelado", "AbortError")); return; }
    const cancel = zip(files, { level: 4 }, (error, data) => {
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(data);
    });
    const abort = () => { cancel(); reject(new DOMException("Cancelado", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
