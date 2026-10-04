import type { PDFDocumentProxy } from "pdfjs-dist";
import type { DocumentTextBlock, EditorPage, ReplacementAnnotation } from "./types";

const searchable = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es")
  .replace(/\s+/g, " ")
  .trim();

export function searchTextBlocks(blocks: DocumentTextBlock[], query: string) {
  const needle = searchable(query);
  if (!needle) return [];
  return blocks.filter((block) => searchable(block.text).includes(needle));
}

export type TextMatch = DocumentTextBlock & {
  blockId: string;
  context: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
};

// Keep a map to original UTF-16 positions while normalizing accents and spaces.
function normalizedText(text: string) {
  let value = "";
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
    for (const part of char) {
      const next = /\s/.test(part) ? " " : part;
      if (next === " " && value.endsWith(" ")) continue;
      value += next;
      offsets.push(i);
    }
  }
  return { value, offsets };
}

function matchRect(block: DocumentTextBlock, start: number, end: number) {
  const boxes = block.characterBoxes?.slice(start, end);
  if (boxes?.length) {
    const x = Math.min(...boxes.map((box) => box.x));
    const y = Math.min(...boxes.map((box) => box.y));
    return { x, y, width: Math.max(...boxes.map((box) => box.x + box.width)) - x, height: Math.max(...boxes.map((box) => box.y + box.height)) - y };
  }
  // Legacy project indexes do not contain glyph metrics.
  return { x: block.x + block.width * start / block.text.length, y: block.y, width: block.width * (end - start) / block.text.length, height: block.height };
}

export function searchTextMatches(blocks: DocumentTextBlock[], query: string): TextMatch[] {
  const needle = searchable(query);
  if (!needle) return [];
  const lines: DocumentTextBlock[][] = [];
  for (const block of blocks) {
    const line = lines[lines.length - 1];
    const previous = line?.[line.length - 1];
    if (previous && previous.pageId === block.pageId && previous.source === block.source && Math.abs(previous.y - block.y) < Math.min(previous.height, block.height) * 0.4 && block.x >= previous.x + previous.width - 2 && block.x - previous.x - previous.width < previous.fontSize * 2) line.push(block);
    else lines.push([block]);
  }
  const matches: TextMatch[] = [];
  for (const line of lines) {
    let text = "";
    const ranges = line.map((block) => {
      if (text && !text.endsWith(" ") && !block.text.startsWith(" ")) text += " ";
      const start = text.length;
      text += block.text;
      return { block, start, end: text.length };
    });
    const normalized = normalizedText(text);
    for (let offset = normalized.value.indexOf(needle); offset !== -1; offset = normalized.value.indexOf(needle, offset + needle.length)) {
      const start = normalized.offsets[offset];
      const end = normalized.offsets[offset + needle.length - 1] + 1;
      const parts = ranges.filter((range) => range.start < end && range.end > start);
      const block = parts[0].block;
      const rects = parts.map((range) => matchRect(range.block, Math.max(0, start - range.start), Math.min(range.block.text.length, end - range.start)));
      const x = Math.min(...rects.map((rect) => rect.x));
      const y = Math.min(...rects.map((rect) => rect.y));
      matches.push({ ...block, id: `${block.id}:match:${start}`, blockId: block.id, text: text.slice(start, end), context: text, rects, x, y, width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x, height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y });
    }
  }
  return matches;
}

export function createReplacement(
  block: DocumentTextBlock,
  text: string,
  id = crypto.randomUUID(),
): ReplacementAnnotation {
  return {
    id,
    pageId: block.pageId,
    type: "replacement",
    sourceTextBlockId: block.id,
    x: block.x,
    y: block.y,
    width: block.width,
    height: Math.max(block.height, block.fontSize * 1.25),
    text,
    fontSize: block.fontSize,
    color: "#111111",
    backgroundColor: "#ffffff",
    opacity: 1,
  };
}

export async function extractPdfTextBlocks(
  document: PDFDocumentProxy,
  editorPage: EditorPage,
): Promise<DocumentTextBlock[]> {
  const page = await document.getPage(editorPage.sourcePageIndex + 1);
  const content = await page.getTextContent();
  const context = typeof window !== "undefined" ? window.document.createElement("canvas").getContext("2d") : null;
  return content.items.flatMap((item, index) => {
    if (!("str" in item) || !item.str.trim()) return [];
    const transform = item.transform;
    const fontSize = Math.max(6, Math.hypot(transform[2], transform[3]) || item.height || 12);
    const height = Math.max(item.height || fontSize, fontSize);
    const style = content.styles[item.fontName];
    if (context) context.font = `${fontSize}px ${style?.fontFamily ?? "sans-serif"}`;
    const advances = Array.from({ length: item.str.length + 1 }, (_, i) => context?.measureText(item.str.slice(0, i)).width ?? i);
    const total = advances[advances.length - 1] || item.str.length;
    const characterBoxes = advances.slice(0, -1).map((advance, i) => ({ x: transform[4] + item.width * advance / total, y: (editorPage.sourceHeight ?? editorPage.height) - transform[5] - height, width: item.width * (advances[i + 1] - advance) / total, height }));
    return [{
      characterBoxes,
      id: `pdf-${editorPage.id}-${index}`,
      pageId: editorPage.id,
      text: item.str,
      x: transform[4],
      y: (editorPage.sourceHeight ?? editorPage.height) - transform[5] - height,
      width: Math.max(item.width, fontSize * 0.5),
      height,
      fontSize,
      confidence: 100,
      source: "pdf" as const,
    }];
  });
}
