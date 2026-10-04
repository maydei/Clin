import { PDFDocument, degrees } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { addAnnotation, createEditorState, createGroup, reorderPages, rotatePages } from "./model";
import { exportPdf } from "./export";
import type { DocumentSource, EditorPage } from "./types";

async function source(): Promise<DocumentSource> {
  const document = await PDFDocument.create();
  document.addPage([300, 400]);
  const second = document.addPage([500, 300]);
  second.setRotation(degrees(90));
  return {
    id: "source",
    name: "sample.pdf",
    bytes: await document.save(),
    pageCount: 2,
  };
}

const pages: EditorPage[] = [
  { id: "page-1", name: "Page 1", groupId: null, sourceId: "source", sourcePageIndex: 0, order: 0, x: 0, y: 0, width: 300, height: 400, rotation: 0 },
  { id: "page-2", name: "Page 2", groupId: null, sourceId: "source", sourcePageIndex: 1, order: 1, x: 360, y: 0, width: 500, height: 300, rotation: 0 },
];

describe("PDF export", () => {
  it("exports pages in document order with accumulated rotation", async () => {
    const input = await source();
    const state = rotatePages(reorderPages(createEditorState(pages), ["page-2", "page-1"]), ["page-2"], 90);
    const bytes = await exportPdf(state, [input]);
    const exported = await PDFDocument.load(bytes);

    expect(exported.getPageCount()).toBe(2);
    expect(exported.getPage(0).getSize()).toEqual({ width: 500, height: 300 });
    expect(exported.getPage(0).getRotation().angle).toBe(180);
  });

  it("writes editor annotations into the exported page content", async () => {
    const input = await source();
    const state = addAnnotation(createEditorState(pages.slice(0, 1)), {
      id: "label",
      pageId: "page-1",
      type: "text",
      x: 30,
      y: 40,
      width: 120,
      height: 30,
      text: "Aprobado",
      fontSize: 18,
      color: "#111111",
      opacity: 1,
    });
    const bytes = await exportPdf(state, [input]);
    const exported = await PDFDocument.load(bytes);

    expect(bytes.byteLength).toBeGreaterThan(input.bytes.byteLength);
    expect(exported.getPage(0).node.Contents()).toBeDefined();
  });

  it("writes ink, highlight and rectangle annotations when originals are available", async () => {
    const input = await source();
    const base = createEditorState(pages.slice(0, 1));
    const withInk = addAnnotation(base, {
      id: "ink", pageId: "page-1", type: "ink", color: "#ff0000", opacity: 0.8,
      size: 4, points: [[10, 10, 0.2], [50, 60, 0.8]],
    });
    const withHighlight = addAnnotation(withInk, {
      id: "highlight", pageId: "page-1", type: "highlight", color: "#ffff00", opacity: 0.3,
      size: 18, points: [[20, 100, 0], [120, 100, 0]],
    });
    const withRectangle = addAnnotation(withHighlight, {
      id: "box", pageId: "page-1", type: "rectangle", x: 30, y: 140,
      width: 120, height: 80, color: "invalid", opacity: 1,
    });

    const bytes = await exportPdf(withRectangle, [input]);
    const exported = await PDFDocument.load(bytes);

    expect(exported.getPageCount()).toBe(1);
    expect(exported.getPage(0).node.Contents()).toBeDefined();
  });

  it("exports only the pages contained by the requested group", async () => {
    const input = await source();
    const state = createGroup(createEditorState(pages), ["page-2"], {
      id: "delivery",
      name: "Delivery",
      parentId: null,
    });

    const bytes = await exportPdf(state, [input], "delivery");
    const exported = await PDFDocument.load(bytes);

    expect(exported.getPageCount()).toBe(1);
    expect(exported.getPage(0).getSize()).toEqual({ width: 500, height: 300 });
  });

  it("exports only explicitly selected pages in document order", async () => {
    const input = await source();
    const bytes = await exportPdf(createEditorState(pages), [input], null, { pageIds: ["page-2"] });
    const exported = await PDFDocument.load(bytes);
    expect(exported.getPageCount()).toBe(1);
    expect(exported.getPage(0).getSize()).toEqual({ width: 500, height: 300 });
  });

  it("optionally prints whiteboard annotations that cross a page", async () => {
    const input = await source();
    const state = addAnnotation(createEditorState(pages.slice(0, 1)), {
      id: "board-note",
      pageId: null,
      type: "text",
      x: 30,
      y: 40,
      width: 120,
      height: 30,
      text: "Pizarra",
      fontSize: 18,
      color: "#111111",
      opacity: 1,
    });

    const withoutBoard = await exportPdf(state, [input]);
    const withBoard = await exportPdf(state, [input], null, { includeBoard: true });
    expect(withBoard.byteLength).toBeGreaterThan(withoutBoard.byteLength);
  });
});


it("reports missing originals before starting PDF generation, and succeeds once restored", async () => {
  const input = await source();
  const state = createEditorState([...pages, { ...pages[0], id: "missing-page", name: "Contrato", sourceId: "lost-original", order: 2 }]);
  const create = vi.spyOn(PDFDocument, "create");
  try {
    await expect(exportPdf(state, [input])).rejects.toThrow("faltan originales para estas páginas: Contrato");
    expect(create).not.toHaveBeenCalled();
    const recovered = await exportPdf(state, [input, { ...input, id: "lost-original" }]);
    expect((await PDFDocument.load(recovered)).getPageCount()).toBe(3);
    const selected = await exportPdf(state, [input], null, { pageIds: ["page-1"] });
    expect((await PDFDocument.load(selected)).getPageCount()).toBe(1);
  } finally { create.mockRestore(); }
});
