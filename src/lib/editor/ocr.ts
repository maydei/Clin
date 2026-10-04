import type { PDFDocumentProxy } from "pdfjs-dist";
import type { DocumentTextBlock, EditorPage } from "./types";

type OcrProgress = (progress: number, status: string) => void;

let workerPromise: ReturnType<typeof createLocalWorker> | null = null;
let progressListener: OcrProgress | null = null;

async function createLocalWorker() {
  const Tesseract = await import("tesseract.js");
  return Tesseract.createWorker(["spa", "eng"], Tesseract.OEM.LSTM_ONLY, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    logger: (message) => progressListener?.(message.progress, message.status),
  });
}

export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException("Cancelado", "AbortError"));
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

export async function recognizePageText(
  document: PDFDocumentProxy,
  editorPage: EditorPage,
  onProgress?: OcrProgress,
  signal?: AbortSignal,
): Promise<DocumentTextBlock[]> {
  signal?.throwIfAborted();
  const scale = 1.65;
  const page = await abortable(document.getPage(editorPage.sourcePageIndex + 1), signal);
  const viewport = page.getViewport({ scale });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("No se pudo preparar la página para OCR.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas, canvasContext: context, viewport });
  const abort = () => { task.cancel(); void terminateOcrWorker().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
  await abortable(task.promise, signal);
  signal?.throwIfAborted();

  progressListener = onProgress ?? null;
  workerPromise ??= createLocalWorker().catch((error) => { workerPromise = null; throw error; });
  const worker = await abortable(workerPromise, signal);
  signal?.throwIfAborted();
  const recognition = worker.recognize(canvas, {}, { text: true, blocks: true });
  const { data } = await new Promise<Awaited<typeof recognition>>((resolve, reject) => {
    const cancelRecognition = () => reject(new DOMException("Cancelado", "AbortError"));
    signal?.addEventListener("abort", cancelRecognition, { once: true });
    if (signal?.aborted) cancelRecognition();
    void recognition.then(resolve, reject).finally(() => signal?.removeEventListener("abort", cancelRecognition));
  });
  signal?.throwIfAborted();
  progressListener = null;

  const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));
  if (!lines.length && data.text.trim()) {
    return [{
      id: `ocr-${editorPage.id}-0`,
      pageId: editorPage.id,
      text: data.text.trim(),
      x: 16,
      y: 16,
      width: Math.max(32, editorPage.width - 32),
      height: Math.max(20, editorPage.height - 32),
      fontSize: 12,
      confidence: data.confidence,
      source: "ocr",
    }];
  }
  return lines.flatMap((line, index) => line.text.trim() ? [{
    id: `ocr-${editorPage.id}-${index}`,
    pageId: editorPage.id,
    text: line.text.trim(),
    characterBoxes: (() => {
      const symbols = line.words.flatMap((word) => word.symbols);
      let symbolIndex = 0;
      return line.text.trim().split("").map((char) => {
        if (/\s/.test(char)) {
          const previous = symbols[Math.max(0, symbolIndex - 1)]?.bbox;
          const next = symbols[symbolIndex]?.bbox;
          return { x: (previous?.x1 ?? line.bbox.x0) / scale, y: line.bbox.y0 / scale, width: Math.max(0, (next?.x0 ?? line.bbox.x1) - (previous?.x1 ?? line.bbox.x0)) / scale, height: (line.bbox.y1 - line.bbox.y0) / scale };
        }
        const box = symbols[symbolIndex++]?.bbox ?? line.bbox;
        return { x: box.x0 / scale, y: box.y0 / scale, width: (box.x1 - box.x0) / scale, height: (box.y1 - box.y0) / scale };
      });
    })(),
    x: line.bbox.x0 / scale,
    y: line.bbox.y0 / scale,
    width: Math.max(1, (line.bbox.x1 - line.bbox.x0) / scale),
    height: Math.max(1, (line.bbox.y1 - line.bbox.y0) / scale),
    fontSize: Math.max(6, ((line.bbox.y1 - line.bbox.y0) / scale) * 0.82),
    confidence: line.confidence,
    source: "ocr" as const,
  }] : []);
  } finally { signal?.removeEventListener("abort", abort); progressListener = null; canvas.width = 0; canvas.height = 0; }
}

export async function terminateOcrWorker() {
  if (!workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  progressListener = null;
  const worker = await pending;
  await worker.terminate();
}
