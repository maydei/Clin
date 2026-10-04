import { describe, expect, it } from "vitest";
import {
  addAnnotation,
  clearAnnotationObjects,
  clearStrokeAnnotations,
  createEditorState,
  deleteAnnotations,
  deletePages,
  duplicatePages,
  movePages,
  moveAnnotation,
  normalizeEditorState,
  pageIdsForSelection,
  reorderPages,
  rotatePages,
  selectAnnotation,
  selectPages,
  setTool,
  updateAnnotation,
} from "./model";
import type { EditorPage } from "./types";

const page = (id: string, order: number): EditorPage => ({
  id,
  name: `Page ${id}`,
  groupId: null,
  sourceId: "source-a",
  sourcePageIndex: order,
  order,
  x: order * 120,
  y: order * 80,
  width: 595,
  height: 842,
  rotation: 0,
});

describe("document model", () => {
  it("selects individual pages with Ctrl and consecutive ranges with Shift", () => {
    const pages = [page("a", 0), page("b", 1), page("c", 2), page("d", 3), page("e", 4)];

    expect(pageIdsForSelection(pages, ["a", "c"], "e", { toggle: true, anchorId: "c" })).toEqual(["a", "c", "e"]);
    expect(pageIdsForSelection(pages, ["b"], "e", { range: true, anchorId: "b" })).toEqual(["b", "c", "d", "e"]);
  });

  it("migrates legacy saved states that do not contain groups or annotations", () => {
    const legacy = {
      pages: [page("a", 0)],
      selectedPageIds: [],
      tool: "select",
    } as unknown as Parameters<typeof normalizeEditorState>[0];

    expect(normalizeEditorState(legacy)).toMatchObject({
      groups: [],
      annotations: [],
      textBlocks: [],
      selectedGroupId: null,
      selectedAnnotationId: null,
    });
  });

  it("clears only strokes or all non-replacement annotations", () => {
    const base = createEditorState([page("a", 0)]);
    const annotations = [
      { id: "ink", pageId: "a", type: "ink", color: "#111111", opacity: 1, size: 3, points: [[1, 1, 0.5], [2, 2, 0.5]] },
      { id: "highlight", pageId: "a", type: "highlight", color: "#ffff00", opacity: 0.3, size: 12, points: [[1, 3, 0.5], [2, 4, 0.5]] },
      { id: "shape", pageId: "a", type: "rectangle", x: 1, y: 1, width: 10, height: 10, color: "#111111", opacity: 1 },
      { id: "text", pageId: "a", type: "text", x: 1, y: 1, width: 10, height: 10, text: "Nota", color: "#111111", opacity: 1 },
      { id: "replacement", pageId: "a", type: "replacement", sourceTextBlockId: "block", x: 1, y: 1, width: 10, height: 10, text: "Cambio", fontSize: 10, color: "#111111", backgroundColor: "#ffffff", opacity: 1 },
    ] as typeof base.annotations;
    const state = { ...base, annotations, selectedAnnotationId: "ink" };

    expect(clearStrokeAnnotations(state).annotations.map((item) => item.id)).toEqual(["shape", "text", "replacement"]);
    expect(clearAnnotationObjects(state).annotations.map((item) => item.id)).toEqual(["replacement"]);
    expect(clearAnnotationObjects(state).selectedAnnotationId).toBeNull();
  });

  it("moves pages in the scene without changing document order", () => {
    const state = createEditorState([page("a", 0), page("b", 1)]);
    const moved = movePages(state, ["b"], 240, -60);

    expect(moved.pages.find((item) => item.id === "b")).toMatchObject({ x: 360, y: 20 });
    expect(moved.pages.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("reorders pages and their canvas coordinates together", () => {
    const state = createEditorState([page("a", 0), page("b", 1), page("c", 2)]);
    const reordered = reorderPages(state, ["c", "a", "b"]);

    expect(reordered.pages.map((item) => [item.id, item.order])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
    expect(reordered.pages.find((item) => item.id === "c")?.x).toBe(0);
  });

  it("duplicates pages and their annotations with new identifiers", () => {
    const withAnnotation = addAnnotation(createEditorState([page("a", 0)]), {
      id: "note-a",
      pageId: "a",
      type: "text",
      x: 24,
      y: 32,
      width: 180,
      height: 48,
      text: "Revisar",
      color: "#111111",
      opacity: 1,
    });

    const duplicated = duplicatePages(withAnnotation, ["a"], () => "copy");

    expect(duplicated.pages).toHaveLength(2);
    expect(duplicated.pages[1]).toMatchObject({ id: "copy-page", order: 1 });
    expect(duplicated.annotations).toContainEqual(
      expect.objectContaining({ id: "copy-annotation-0", pageId: "copy-page", text: "Revisar" }),
    );
  });

  it("deletes selected pages and their annotations, then normalizes order", () => {
    const state = addAnnotation(createEditorState([page("a", 0), page("b", 1)]), {
      id: "ink-a",
      pageId: "a",
      type: "ink",
      color: "#ef4444",
      opacity: 1,
      size: 4,
      points: [[1, 1, 0.5], [4, 5, 0.7]],
    });

    const deleted = deletePages(selectPages(state, ["a"]), ["a"]);

    expect(deleted.pages).toEqual([expect.objectContaining({ id: "b", order: 0 })]);
    expect(deleted.annotations).toEqual([]);
    expect(deleted.selectedPageIds).toEqual([]);
  });

  it("rotates selected pages using normalized quarter turns", () => {
    const state = createEditorState([page("a", 0)]);
    expect(rotatePages(state, ["a"], 450).pages[0].rotation).toBe(90);
    expect(rotatePages(state, ["a"], -90).pages[0].rotation).toBe(270);
  });

  it("normalizes selection, tools and partial order requests", () => {
    const state = createEditorState([page("b", 1), page("a", 0)]);
    const selected = selectPages(state, ["b", "missing", "b"]);
    const annotationSelected = selectAnnotation(selected, "note");

    expect(state.pages.map((item) => item.id)).toEqual(["a", "b"]);
    expect(selected.selectedPageIds).toEqual(["b"]);
    expect(annotationSelected.selectedPageIds).toEqual([]);
    expect(selectAnnotation(annotationSelected, null).selectedAnnotationId).toBeNull();
    expect(setTool(state, "hand").tool).toBe("hand");
    expect(reorderPages(state, ["missing", "b", "b"]).pages.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("validates, updates and deletes annotations without changing their ownership", () => {
    const state = createEditorState([page("a", 0), page("b", 1)]);
    const invalid = addAnnotation(state, {
      id: "missing-note", pageId: "missing", type: "text", x: 0, y: 0,
      width: 100, height: 20, text: "Nada", color: "#000000", opacity: 1,
    });
    expect(invalid).toBe(state);

    const withNote = addAnnotation(state, {
      id: "note", pageId: "a", type: "text", x: 10, y: 20,
      width: 100, height: 20, text: "Antes", color: "#000000", opacity: 1,
    });
    const updated = updateAnnotation(withNote, "note", {
      id: "changed", pageId: "b", text: "Después",
    });

    expect(updated.annotations[0]).toMatchObject({ id: "note", pageId: "a", text: "Después" });
    expect(updateAnnotation(updated, "missing", { opacity: 0.5 }).annotations).toEqual(updated.annotations);
    expect(deleteAnnotations(updated, ["other"]).selectedAnnotationId).toBe("note");
    expect(deleteAnnotations(updated, ["note"]).annotations).toEqual([]);
    expect(deleteAnnotations(updated, ["note"]).selectedAnnotationId).toBeNull();
  });

  it("moves box annotations and keeps them inside their page", () => {
    const withNote = addAnnotation(createEditorState([page("a", 0)]), {
      id: "note", pageId: "a", type: "text", x: 10, y: 20,
      width: 100, height: 30, text: "Nota", color: "#000000", opacity: 1,
    });

    const moved = moveAnnotation(withNote, "note", 40, 25);
    expect(moved.annotations[0]).toMatchObject({ x: 50, y: 45 });

    const clamped = moveAnnotation(moved, "note", 10_000, 10_000);
    expect(clamped.annotations[0]).toMatchObject({ x: 495, y: 812 });
  });

  it("clears a selected annotation when its page is removed", () => {
    const withNote = addAnnotation(createEditorState([page("a", 0), page("b", 1)]), {
      id: "note", pageId: "a", type: "text", x: 0, y: 0,
      width: 100, height: 20, text: "Nota", color: "#000000", opacity: 1,
    });
    expect(deletePages(withNote, ["a"]).selectedAnnotationId).toBeNull();
    expect(deletePages(withNote, ["b"]).selectedAnnotationId).toBe("note");
  });
});
