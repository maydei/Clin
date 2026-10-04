import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { createEditorState, createGroup, reorderPages, orderedPagesForExport } from "./model";
import { plannedPages, assertExportSources } from "./export-task";
import { prepareSpatialDocument } from "./spatial-order";
import { exportPdf } from "./export";
import type { EditorPage } from "./types";

describe("export preview and output order", () => {
  it("keeps manual A/B/C ordering through preparation, selection, group and PDF", async () => {
    const pdf = await PDFDocument.create();
    const pages: EditorPage[] = ["A", "B", "C"].map((id, index) => {
      const page = pdf.addPage([200 + index * 100, 400]);
      page.setRotation(degrees(index * 90));
      return { id, name: id, sourceId: "original", sourcePageIndex: index, groupId: null, x: index * 500, y: 0, width: 200 + index * 100, height: 400, order: index, rotation: 0 };
    });
    const source = { id: "original", name: "ABC.pdf", bytes: await pdf.save(), pageCount: 3 };
    const reordered = reorderPages(createEditorState(pages), ["C", "A", "B"]);
    const state = prepareSpatialDocument(createGroup(reordered, ["C", "B"], { id: "subset", name: "Subset", parentId: null })).state;
    for (const [groupId, pageIds, expected] of [[null, undefined, ["C", "A", "B"]], ["subset", undefined, ["C", "B"]], [null, ["B", "C"], ["C", "B"]]] as const) {
      const preview = orderedPagesForExport(state, groupId, pageIds ? [...pageIds] : undefined);
      expect(preview.map((page) => page.id)).toEqual(expected);
      const options = { pageIds: pageIds ? [...pageIds] : undefined, orderedIds: preview.map((page) => page.id) };
      expect(plannedPages(state, groupId, options).map((page) => page.id)).toEqual(expected);
      const output = await PDFDocument.load(await exportPdf(state, [source], groupId, options));
      expect(output.getPages().map((page) => page.getWidth())).toEqual(preview.map((page) => page.width));
      expect(output.getPages().map((page) => page.getRotation().angle)).toEqual(preview.map((page) => page.sourcePageIndex * 90));
    }
  });
  it("identifies every missing original", () => {
    expect(() => assertExportSources([{ sourceId: "one", name: "A" }, { sourceId: "two", name: "B" }] as EditorPage[], [])).toThrow("faltan originales para estas páginas: A, B");
  });
});
