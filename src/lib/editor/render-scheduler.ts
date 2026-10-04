import { recordDuration } from "./performance-log";
import type { PDFDocumentProxy } from "pdfjs-dist";

const LIMIT = 256 * 1024 * 1024;
const cache = new Map<string, HTMLCanvasElement>();
const identities = new WeakMap<PDFDocumentProxy, number>();
let nextId = 0;
let bytes = 0;
let running = 0;
const queue: Array<{ signal: AbortSignal; priority: number; run: () => Promise<void>; reject: (reason: unknown) => void }> = [];

function pump() {
  queue.sort((a, b) => b.priority - a.priority);
  while (running < 2 && queue.length) {
    const job = queue.shift()!;
    if (job.signal.aborted) { job.reject(new DOMException("Cancelado", "AbortError")); continue; }
    running++;
    void job.run().finally(() => { running--; pump(); });
  }
}

export function scheduleRender<T>(run: () => Promise<T>, signal: AbortSignal, priority = 1): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelado", "AbortError")); return; }
    const abort = () => {
      const index = queue.indexOf(job);
      if (index >= 0) queue.splice(index, 1);
      reject(new DOMException("Cancelado", "AbortError"));
    };
    const job = { signal, priority, reject, run: async () => {
      try { signal.throwIfAborted(); resolve(await run()); }
      catch (error) { reject(error); }
      finally { signal.removeEventListener("abort", abort); }
    } };
    signal.addEventListener("abort", abort, { once: true });
    queue.push(job);
    pump();
  });
}

function identity(document: PDFDocumentProxy) {
  if (!identities.has(document)) identities.set(document, ++nextId);
  return identities.get(document)!;
}

export function releasePageCache(document: PDFDocumentProxy) {
  const prefix = `${identity(document)}:`;
  for (const [key, canvas] of cache) if (key.startsWith(prefix)) {
    bytes -= canvas.width * canvas.height * 4;
    cache.delete(key);
  }
}

export function cachedPageRaster(document: PDFDocumentProxy, pageIndex: number) {
  const prefix = `${identity(document)}:${pageIndex}:`;
  let raster: HTMLCanvasElement | undefined;
  for (const [key, canvas] of cache) if (key.startsWith(prefix)) raster = canvas;
  return raster;
}

export async function renderPage(document: PDFDocumentProxy, pageIndex: number, scale: number, signal: AbortSignal, priority = 1) {
  const key = `${identity(document)}:${pageIndex}:${scale}`;
  signal.throwIfAborted();
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
  return scheduleRender(async () => {
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    const startedAt = performance.now();
    const page = await document.getPage(pageIndex + 1);
    signal.throwIfAborted();
    const initial = page.getViewport({ scale });
    // Bound a single raster even for unusually large PDF page dimensions.
    const factor = Math.min(1, Math.sqrt(8_000_000 / (initial.width * initial.height)));
    const viewport = page.getViewport({ scale: scale * factor });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("No se pudo preparar la página.");
    const task = page.render({ canvas, canvasContext: context, viewport });
    const cancel = () => task.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try { await task.promise; signal.throwIfAborted(); }
    catch (error) { canvas.width = 0; canvas.height = 0; throw error; }
    finally { signal.removeEventListener("abort", cancel); }
    recordDuration("page-render", startedAt);
    const size = canvas.width * canvas.height * 4;
    while (bytes + size > LIMIT && cache.size) {
      const [oldKey, oldCanvas] = cache.entries().next().value!;
      bytes -= oldCanvas.width * oldCanvas.height * 4;
      cache.delete(oldKey);
    }
    if (size <= LIMIT) { cache.set(key, canvas); bytes += size; }
    return canvas;
  }, signal, priority);
}

export function renderingSnapshot() { return { cacheBytes: bytes, cacheLimitBytes: LIMIT, activeRenders: running, queuedRenders: queue.length }; }
