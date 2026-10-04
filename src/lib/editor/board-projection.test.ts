import { describe, expect, it } from "vitest";
import { boardAnnotationsForPage } from "./board-projection";
import type { Annotation, EditorPage } from "./types";

const page: EditorPage = { id: "page", name: "Página", groupId: null, sourceId: "source", sourcePageIndex: 0, order: 0, x: 100, y: 200, width: 300, height: 400, rotation: 0 };

describe("whiteboard projection", () => {
  it("projects intersecting board strokes into page coordinates and ignores distant content", () => {
    const annotations: Annotation[] = [
      { id: "crossing", pageId: null, type: "ink", color: "#111111", opacity: 1, size: 4, points: [[80, 220, 0.5], [180, 240, 0.5]] },
      { id: "distant", pageId: null, type: "ink", color: "#111111", opacity: 1, size: 4, points: [[700, 800, 0.5], [720, 820, 0.5]] },
    ];

    const projected = boardAnnotationsForPage(annotations, page);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ id: "board-crossing-page", pageId: "page" });
    expect(projected[0].type === "ink" && projected[0].points).toEqual([[-20, 20, 0.5], [80, 40, 0.5]]);
  });
});
