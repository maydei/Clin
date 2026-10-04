import { describe, expect, it } from "vitest";
import { addAnnotation, createEditorState, deletePages } from "./model";
import type { StrokeAnnotation } from "./types";

describe("whiteboard annotations", () => {
  it("stores a canvas-level stroke without requiring a PDF page", () => {
    const stroke: StrokeAnnotation = {
      id: "board-stroke",
      pageId: null,
      type: "ink",
      points: [[10, 20, 0.5], [80, 90, 0.5]],
      color: "#111111",
      opacity: 1,
      size: 4,
    };
    const state = addAnnotation(createEditorState(), stroke);
    expect(state.annotations).toEqual([stroke]);
    expect(state.selectedAnnotationId).toBe("board-stroke");
  });

  it("keeps whiteboard content when a PDF page is deleted", () => {
    const page = {
      id: "page-1",
      name: "Página 1",
      groupId: null,
      sourceId: "source-1",
      sourcePageIndex: 0,
      order: 0,
      x: 0,
      y: 0,
      width: 200,
      height: 300,
      rotation: 0,
    };
    const stroke: StrokeAnnotation = {
      id: "board-stroke",
      pageId: null,
      type: "ink",
      points: [[10, 20, 0.5], [80, 90, 0.5]],
      color: "#111111",
      opacity: 1,
      size: 4,
    };
    const state = addAnnotation({ ...createEditorState(), pages: [page] }, stroke);
    expect(deletePages(state, [page.id]).annotations).toEqual([stroke]);
  });
});
