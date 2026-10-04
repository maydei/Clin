import { describe, expect, it } from "vitest";
import { mergeRecentProjects } from "./autosave";
import { createEditorState } from "./model";
import type { EditorProject } from "./types";

const project = (id: string, name: string, updatedAt: string): EditorProject => ({
  id,
  version: 1,
  name,
  updatedAt,
  state: createEditorState(),
  sources: [],
});

describe("recent projects", () => {
  it("updates the same project and keeps the five newest entries", () => {
    const initial = [
      project("1", "One", "2026-01-01T00:00:00.000Z"),
      project("2", "Two", "2026-01-02T00:00:00.000Z"),
      project("3", "Three", "2026-01-03T00:00:00.000Z"),
      project("4", "Four", "2026-01-04T00:00:00.000Z"),
      project("5", "Five", "2026-01-05T00:00:00.000Z"),
    ];

    const updated = mergeRecentProjects(initial, project("2", "Two renamed", "2026-02-01T00:00:00.000Z"));
    const withNew = mergeRecentProjects(updated, project("6", "Six", "2026-03-01T00:00:00.000Z"));

    expect(withNew).toHaveLength(5);
    expect(withNew.map((item) => item.id)).toEqual(["6", "2", "5", "4", "3"]);
    expect(withNew.find((item) => item.id === "2")?.name).toBe("Two renamed");
  });
});
