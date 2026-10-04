import { createHistory, commit, undo, redo } from "./history";
import { describe, expect, it } from "vitest";
import {
  alignPages,
  arrangePagesInDirection,
  createEditorState,
  createGroup,
  deleteGroup,
  movePagesToGroup,
  normalizeEditorState,
  orderedPagesForExport,
  renameGroup,
  selectGroup,
  setGroupOrderMode,
  ungroupPages,
  updateGroupExport,
  updatePageName,
} from "./model";
import type { EditorPage, EditorState } from "./types";

const page = (id: string, order: number, x: number, y: number): EditorPage => ({
  id,
  name: `Página ${order + 1}`,
  groupId: null,
  sourceId: "source-a",
  sourcePageIndex: order,
  order,
  x,
  y,
  width: 100,
  height: 140,
  rotation: 0,
});

describe("canvas groups", () => {
  it("groups pages and supports named nested groups", () => {
    const initial = createEditorState([
      page("a", 0, 300, 0),
      page("b", 1, 0, 400),
      page("c", 2, 0, 0),
    ]);
    const parent = createGroup(initial, ["a", "b"], {
      id: "brand",
      name: "Brand guidelines",
      parentId: null,
    });
    const nested = createGroup(parent, ["b"], {
      id: "voice",
      name: "Tone of voice",
      parentId: "brand",
    });

    expect(nested.groups).toEqual([
      expect.objectContaining({ id: "brand", name: "Brand guidelines", parentId: null }),
      expect.objectContaining({ id: "voice", name: "Tone of voice", parentId: "brand" }),
    ]);
    expect(nested.pages.find((item) => item.id === "a")?.groupId).toBe("brand");
    expect(nested.pages.find((item) => item.id === "b")?.groupId).toBe("voice");
    expect(renameGroup(nested, "voice", "Voz").groups[1].name).toBe("Voz");
  });

  it("orders group export manually, vertically or horizontally", () => {
    const grouped = createGroup(createEditorState([
      page("a", 2, 300, 0),
      page("b", 1, 0, 400),
      page("c", 0, 0, 0),
    ]), ["a", "b", "c"], { id: "group", name: "Entrega", parentId: null });

    // An untouched canvas exports by rows; explicit manual order also moves pages.
    expect(orderedPagesForExport(grouped, "group").map((item) => item.id)).toEqual(["c", "a", "b"]);
    const manual = setGroupOrderMode(grouped, "group", "manual");
    expect(orderedPagesForExport(manual, "group").map((item) => item.id)).toEqual(["c", "b", "a"]);
    const vertical = setGroupOrderMode(grouped, "group", "vertical");
    expect(orderedPagesForExport(vertical, "group").map((item) => item.id)).toEqual(["c", "a", "b"]);
    const horizontal = setGroupOrderMode(grouped, "group", "horizontal");
    expect(orderedPagesForExport(horizontal, "group").map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(orderedPagesForExport(horizontal, null, ["b", "c"] ).map((item) => item.id)).toEqual(["c", "b"]);
  });

  it("ungroups pages and promotes children when deleting a group", () => {
    const parent = createGroup(createEditorState([
      page("a", 0, 0, 0),
      page("b", 1, 200, 0),
    ]), ["a"], { id: "parent", name: "Parent", parentId: null });
    const nested = createGroup(parent, ["b"], { id: "child", name: "Child", parentId: "parent" });
    const ungrouped = ungroupPages(nested, ["a"]);
    expect(ungrouped.pages.find((item) => item.id === "a")?.groupId).toBeNull();

    const removed = deleteGroup(ungrouped, "parent");
    expect(removed.groups).toEqual([expect.objectContaining({ id: "child", parentId: null })]);
    expect(movePagesToGroup(removed, ["a"], "child").pages[0].groupId).toBe("child");
  });

  it("renames pages and aligns selected objects", () => {
    const initial = createEditorState([
      page("a", 0, 50, 300),
      page("b", 1, 200, 100),
      page("c", 2, 400, 500),
    ]);
    const renamed = updatePageName(initial, "b", "Design guidelines - página 2");
    expect(renamed.pages[1].name).toBe("Design guidelines - página 2");

    const left = alignPages(renamed, ["a", "b", "c"], "left");
    expect(left.pages.map((item) => item.x)).toEqual([50, 50, 50]);
    const uneven = createEditorState([
      page("a", 0, 0, 0),
      page("b", 1, 0, 700),
      page("c", 2, 0, 300),
    ]);
    const distributed = alignPages(uneven, ["a", "b", "c"], "distribute-y");
    expect(distributed.pages.find((item) => item.id === "c")?.y).toBe(350);

    const row = arrangePagesInDirection(initial, ["a", "b", "c"], "horizontal", 40);
    expect(row.pages.map((item) => item.y)).toEqual([100, 100, 100]);
    expect(row.pages.map((item) => item.x)).toEqual([50, 190, 330]);
  });

  it("rejects invalid group parents and unknown destinations", () => {
    const initial = createEditorState([page("a", 0, 0, 0)]);
    expect(createGroup(initial, ["a"], { id: "bad", name: "Bad", parentId: "missing" })).toBe(initial);
    expect(movePagesToGroup(initial, ["a"], "missing")).toBe(initial);
    expect(selectGroup(initial, "missing")).toBe(initial);
    expect(selectGroup(initial, null).selectedGroupId).toBeNull();
    expect(deleteGroup(initial, "missing")).toBe(initial);
    expect(arrangePagesInDirection(initial, [], "horizontal")).toBe(initial);
    expect(alignPages(initial, ["a"], "left")).toBe(initial);
  });

  it("normalizes legacy state and updates group export preferences", () => {
    const legacy = {
      pages: [{ ...page("a", 0, 0, 0), name: undefined, groupId: undefined }],
      annotations: [],
      selectedPageIds: [],
      selectedAnnotationId: null,
      tool: "select",
    } as unknown as EditorState;
    const normalized = normalizeEditorState(legacy);
    expect(normalized.pages[0]).toMatchObject({ name: "Página 1", groupId: null });
    expect(normalized.groups).toEqual([]);

    const grouped = createGroup(normalized, ["a"], { id: "g", name: "Group", parentId: null });
    expect(createGroup(grouped, [], { id: "g", name: "Duplicate", parentId: null })).toBe(grouped);
    expect(renameGroup(grouped, "g", " ")).toBe(grouped);
    const custom = updateGroupExport(grouped, "g", { filename: "custom", format: "images" });
    expect(custom.groups[0].export).toMatchObject({ filename: "custom", format: "images" });
    expect(renameGroup(custom, "g", "Renamed").groups[0].export.filename).toBe("custom");
    expect(selectGroup(grouped, "g").selectedPageIds).toEqual(["a"]);
  });

  it("covers every page alignment mode", () => {
    const initial = createEditorState([
      page("a", 0, 0, 0),
      page("b", 1, 300, 200),
      page("c", 2, 700, 500),
    ]);
    const ids = ["a", "b", "c"];
    expect(alignPages(initial, ids, "center-x").pages[0].x).toBeGreaterThan(0);
    expect(alignPages(initial, ids, "right").pages[0].x).toBe(700);
    expect(alignPages(initial, ids, "top").pages[2].y).toBe(0);
    expect(alignPages(initial, ids, "center-y").pages[0].y).toBeGreaterThan(0);
    expect(alignPages(initial, ids, "bottom").pages[0].y).toBe(500);
    expect(alignPages(initial, ids, "distribute-x").pages[1].x).toBe(350);
  });
});


it("keeps invalid group selection out of history and preserves a valid selection", () => {
  const grouped = createGroup(createEditorState([page("a", 0, 0, 0)]), ["a"], { id: "valid", name: "Valid", parentId: null });
  const selected = selectGroup(grouped, "valid");
  const history = createHistory(selected);
  expect(selectGroup(selected, "missing")).toBe(selected);
  expect(commit(history, selectGroup(selected, "missing"))).toBe(history);
  const deleted = deleteGroup(selected, "valid");
  expect(selectGroup(deleted, "valid")).toBe(deleted);
  expect(selectGroup(selected, null).selectedGroupId).toBeNull();
});

it("orders nested group members without moving outside pages and supports undo", () => {
  let state = createEditorState([page("a", 0, 300, 0), page("outside", 1, 1500, 1600), page("b", 2, 0, 400), page("c", 3, 0, 0)]);
  state = createGroup(state, ["a"], { id: "parent", name: "Parent", parentId: null });
  state = createGroup(state, ["b", "c"], { id: "child", name: "Child", parentId: "parent" });
  const ordered = setGroupOrderMode(state, "parent", "horizontal");
  expect(orderedPagesForExport(ordered, "parent").map((p) => p.id)).toEqual(["c", "b", "a"]);
  expect(ordered.pages.find((p) => p.id === "outside")).toBe(state.pages.find((p) => p.id === "outside"));
  expect(ordered.pages.find((p) => p.id === "b")?.groupId).toBe("child");
  const history = commit(createHistory(state), ordered);
  expect(undo(history).present).toBe(state);
  expect(redo(undo(history)).present).toEqual(history.present);
});
