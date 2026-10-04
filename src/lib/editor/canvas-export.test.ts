import { describe, expect, it } from "vitest";
import { boundsForCanvasContent } from "./canvas-export";
import type { EditorState } from "./types";

const state = {
  pages: [{ id: "page", name: "Page", groupId: null, sourceId: "source", sourcePageIndex: 0, order: 0, x: 100, y: 100, width: 200, height: 300, rotation: 0 }],
  groups: [],
  textBlocks: [],
  selectedPageIds: [],
  selectedGroupId: null,
  selectedAnnotationId: null,
  tool: "select",
  annotations: [{ id: "stroke", pageId: null, type: "ink", points: [[20, 30, 0.5], [420, 480, 0.5]], color: "#000000", opacity: 1, size: 10 }],
} satisfies EditorState;

describe("canvas image export", () => {
  it("includes pages and whiteboard strokes in the exported bounds", () => {
    expect(boundsForCanvasContent(state)).toEqual({ x: 15, y: 25, width: 410, height: 460 });
  });
});
