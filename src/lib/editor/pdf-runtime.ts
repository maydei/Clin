import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import type { DocumentOutlineItem, DocumentSource, EditorPage } from "./types";

const MAX_PDF_SIZE = 300 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
let pdfJsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export type ImportedPdf = {
  source: DocumentSource;
  document: PDFDocumentProxy;
  pages: EditorPage[];
};

export function isSupportedImageFile(file: File) {
  return IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
}

async function imageBytesForPdf(file: File, bitmap: ImageBitmap) {
  if (file.type === "image/png" || /\.png$/i.test(file.name)) {
    return { bytes: new Uint8Array(await file.arrayBuffer()), type: "png" as const };
  }
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) {
    return { bytes: new Uint8Array(await file.arrayBuffer()), type: "jpeg" as const };
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo convertir la imagen.")), "image/png"));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: "png" as const };
}

export async function importImageFile(file: File, position: { x: number; y: number }): Promise<ImportedPdf> {
  if (!isSupportedImageFile(file)) throw new Error(`${file.name} no es una imagen compatible.`);
  if (file.size > MAX_PDF_SIZE) throw new Error(`${file.name} supera el límite de 300 MB.`);
  const bitmap = await createImageBitmap(file);
  try {
    const pdf = await PDFDocument.create();
    const imageData = await imageBytesForPdf(file, bitmap);
    const image = imageData.type === "png" ? await pdf.embedPng(imageData.bytes) : await pdf.embedJpg(imageData.bytes);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, bitmap.width * scale);
    const height = Math.max(1, bitmap.height * scale);
    const page = pdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
    const pdfBytes = await pdf.save();
    const baseName = file.name.replace(/\.(png|jpe?g|webp)$/i, "");
    const pdfFile = new File([Uint8Array.from(pdfBytes).buffer], `${baseName}.pdf`, { type: "application/pdf" });
    const imported = await importPdfFile(pdfFile, position);
    return {
      ...imported,
      source: { ...imported.source, name: file.name },
      pages: imported.pages.map((item) => ({ ...item, name: baseName })),
    };
  } finally {
    bitmap.close();
  }
}

export async function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

export async function importPdfFile(
  file: File,
  position: { x: number; y: number },
  options: { signal?: AbortSignal; onPages?: (imported: ImportedPdf) => void } = {},
): Promise<ImportedPdf> {
  if (file.size > MAX_PDF_SIZE) {
    throw new Error(`${file.name} supera el límite de 300 MB.`);
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error(`${file.name} no es un archivo PDF.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") throw new Error(`${file.name} no contiene un PDF válido.`);

  const pdfjs = await getPdfJs();
  const document = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const sourceId = crypto.randomUUID();
  const source: DocumentSource = { id: sourceId, name: file.name, bytes, pageCount: document.numPages, indexComplete: false };
  let delivered = 0;
  const pages: EditorPage[] = [];
  let x = position.x;
  let y = position.y;
  let rowHeight = 0;
  const columns = document.numPages > 8 ? 4 : Math.min(document.numPages, 3);

  try {
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    options.signal?.throwIfAborted();
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({
      id: crypto.randomUUID(),
      name: `${file.name.replace(/\.pdf$/i, "")} - página ${pageNumber}`,
      groupId: null,
      sourceId,
      sourcePageIndex: pageNumber - 1,
      order: pageNumber - 1,
      x,
      y,
      width: viewport.width,
      height: viewport.height,
      rotation: 0,
    });
    if (options.onPages && (pageNumber === 1 || pageNumber % 16 === 0 || pageNumber === document.numPages)) {
      options.onPages({ source, document, pages: pages.slice(delivered) });
      delivered = pages.length;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    rowHeight = Math.max(rowHeight, viewport.height);
    if (pageNumber % columns === 0) {
      x = position.x;
      y += rowHeight + 72;
      rowHeight = 0;
    } else {
      x += viewport.width + 72;
    }
  }

  } catch (error) {
    if (!delivered) await document.loadingTask.destroy();
    throw error;
  }
  const rawOutline = await document.getOutline().catch(() => null);
  const resolveOutline = async (
    items: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>,
    path = "outline",
  ): Promise<DocumentOutlineItem[]> => Promise.all(items.map(async (item, index) => {
    let destination = item.dest;
    if (typeof destination === "string") destination = await document.getDestination(destination);
    let pageIndex: number | null = null;
    if (Array.isArray(destination) && destination[0]) {
      try {
        pageIndex = await document.getPageIndex(destination[0]);
      } catch {
        pageIndex = null;
      }
    }
    return {
      id: `${path}-${index}`,
      title: item.title || `Sección ${index + 1}`,
      pageIndex,
      children: await resolveOutline(item.items ?? [], `${path}-${index}`),
    };
  }));
  const outline = await resolveOutline(rawOutline ?? []);

  return {
    source: { id: sourceId, name: file.name, bytes, pageCount: document.numPages, outline, indexComplete: false },
    document,
    pages,
  };
}

export async function restorePdfSource(source: DocumentSource): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfJs();
  return pdfjs.getDocument({ data: source.bytes.slice() }).promise;
}
