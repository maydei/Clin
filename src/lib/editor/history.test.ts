import { describe, expect, it } from "vitest";
import { createEditorState, movePages } from "./model";
import { commit, createHistory, redo, undo } from "./history";
import type { EditorPage } from "./types";

const page: EditorPage = {
  id: "page-a",
  name: "Page A",
  groupId: null,
  sourceId: "source-a",
  sourcePageIndex: 0,
  order: 0,
  x: 0,
  y: 0,
  width: 595,
  height: 842,
  rotation: 0,
};

describe("editor history", () => {
  it("undoes and redoes committed document changes", () => {
    const initial = createHistory(createEditorState([page]));
    const changed = commit(initial, movePages(initial.present, ["page-a"], 50, 20));

    expect(changed.present.pages[0].x).toBe(50);
    expect(undo(changed).present.pages[0].x).toBe(0);
    expect(redo(undo(changed)).present.pages[0].x).toBe(50);
  });

  it("clears future states after a new commit", () => {
    const initial = createHistory(createEditorState([page]));
    const first = commit(initial, movePages(initial.present, ["page-a"], 10, 0));
    const undone = undo(first);
    const branched = commit(undone, movePages(undone.present, ["page-a"], 0, 15));

    expect(branched.future).toEqual([]);
    expect(redo(branched)).toBe(branched);
  });

  it("keeps identity when there is no history transition", () => {
    const history = createHistory(createEditorState([page]));

    expect(commit(history, history.present)).toBe(history);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });
});
