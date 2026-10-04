import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import type {
  Annotation,
  DocumentSource,
  EditorState,
  RectangleAnnotation,
  ReplacementAnnotation,
  StrokeAnnotation,
  TextAnnotation,
} from "./types";
import { plannedPages, assertExportSources, exportCheckpoint, type ExportOptions } from "./export-task";
import { boardAnnotationsForPage } from "./board-projection";

const normalizeRotation = (rotation: number) => ((rotation % 360) + 360) % 360;

function colorFromHex(value: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!match) return rgb(0.08, 0.08, 0.08);
  return rgb(
    Number.parseInt(match[1], 16) / 255,
    Number.parseInt(match[2], 16) / 255,
    Number.parseInt(match[3], 16) / 255,
  );
}

function drawStroke(
  page: ReturnType<PDFDocument["addPage"]>,
  annotation: StrokeAnnotation,
  pageHeight: number,
) {
  const color = colorFromHex(annotation.color);
  for (let index = 1; index < annotation.points.length; index += 1) {
    const previous = annotation.points[index - 1];
    const current = annotation.points[index];
    const pressure = (previous[2] + current[2]) / 2 || 0.5;
    page.drawLine({
      start: { x: previous[0], y: pageHeight - previous[1] },
      end: { x: current[0], y: pageHeight - current[1] },
      thickness: annotation.size * (0.5 + pressure),
      color,
      opacity: annotation.opacity,
      lineCap: 1,
    });
  }
}

function drawText(
  page: ReturnType<PDFDocument["addPage"]>,
  annotation: TextAnnotation,
  pageHeight: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
) {
  const fontSize = annotation.fontSize ?? 16;
  page.drawText(annotation.text || " ", {
    x: annotation.x,
    y: pageHeight - annotation.y - fontSize,
    size: fontSize,
    font,
    color: colorFromHex(annotation.color),
    opacity: annotation.opacity,
    maxWidth: annotation.width,
    lineHeight: fontSize * 1.2,
  });
}

function drawRectangle(
  page: ReturnType<PDFDocument["addPage"]>,
  annotation: RectangleAnnotation,
  pageHeight: number,
) {
  page.drawRectangle({
    x: annotation.x,
    y: pageHeight - annotation.y - annotation.height,
    width: annotation.width,
    height: annotation.height,
    borderWidth: annotation.size ?? 2,
    borderColor: colorFromHex(annotation.color),
    borderOpacity: annotation.opacity,
    color: annotation.fillColor ? colorFromHex(annotation.fillColor) : undefined,
    opacity: annotation.fillColor ? (annotation.fillOpacity ?? annotation.opacity) : undefined,
  });
}

function drawReplacement(
  page: ReturnType<PDFDocument["addPage"]>,
  annotation: ReplacementAnnotation,
  pageHeight: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
) {
  page.drawRectangle({
    x: annotation.x,
    y: pageHeight - annotation.y - annotation.height,
    width: annotation.width,
    height: annotation.height,
    color: colorFromHex(annotation.backgroundColor),
    opacity: 1,
  });
  if (!annotation.text.trim()) return;
  page.drawText(annotation.text, {
    x: annotation.x,
    y: pageHeight - annotation.y - annotation.fontSize,
    size: annotation.fontSize,
    font,
    color: colorFromHex(annotation.color),
    opacity: annotation.opacity,
    maxWidth: annotation.width,
  });
}

function drawAnnotation(
  page: ReturnType<PDFDocument["addPage"]>,
  annotation: Annotation,
  pageHeight: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
) {
  if (annotation.type === "ink" || annotation.type === "highlight") {
    drawStroke(page, annotation, pageHeight);
  } else if (annotation.type === "text") {
    drawText(page, annotation, pageHeight, font);
  } else if (annotation.type === "rectangle") {
    drawRectangle(page, annotation, pageHeight);
  } else if (annotation.type === "replacement") {
    drawReplacement(page, annotation, pageHeight, font);
  }
}

export async function exportPdf(
  state: EditorState,
  sources: DocumentSource[],
  groupId: string | null = null,
  options: ExportOptions = {},
): Promise<Uint8Array> {
  const pages = plannedPages(state, groupId, options);
  assertExportSources(pages, sources.map((source) => source.id));
  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.Helvetica);
  const loaded = new Map<string, PDFDocument>();

  const needed = new Set(pages.map((page) => page.sourceId));
  for (const source of sources.filter((source) => needed.has(source.id))) {
    loaded.set(source.id, await PDFDocument.load(source.bytes, { updateMetadata: false }));
  }

  for (const editorPage of pages) {
    await exportCheckpoint(options.signal);
    const source = loaded.get(editorPage.sourceId);
    if (!source) throw new Error("Falta un original necesario para exportar.");
    const [copied] = await output.copyPages(source, [editorPage.sourcePageIndex]);
    output.addPage(copied);
    copied.setRotation(
      degrees(normalizeRotation(copied.getRotation().angle + editorPage.rotation)),
    );
    const { height } = copied.getSize();
    const annotations = [
      ...state.annotations.filter((annotation) => annotation.pageId === editorPage.id),
      ...(options.includeBoard ? boardAnnotationsForPage(state.annotations, editorPage) : []),
    ];
    annotations
      .forEach((annotation) => drawAnnotation(copied, annotation, height, font));
    const replaced = new Set(state.annotations.flatMap((annotation) =>
      annotation.type === "replacement" ? [annotation.sourceTextBlockId] : [],
    ));
    state.textBlocks
      .filter((block) => block.pageId === editorPage.id && block.source === "ocr" && !replaced.has(block.id))
      .forEach((block) => copied.drawText(block.text, {
        x: block.x,
        y: height - block.y - block.fontSize,
        size: Math.max(4, block.fontSize),
        font,
        color: rgb(0, 0, 0),
        opacity: 0,
        maxWidth: block.width,
      }));
  }

  output.setProducer("clin");
  output.setCreator("clin");
  output.setModificationDate(new Date());
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}
