import { preserveGroupView } from "./group-view";
import { pruneEmptyGroups } from "./selection";
import type { EditorState } from "./types";

export type EditorHistory = {
  past: EditorState[];
  present: EditorState;
  future: EditorState[];
};

export function createHistory(state: EditorState): EditorHistory {
  return { past: [], present: state, future: [] };
}

export function commit(history: EditorHistory, state: EditorState): EditorHistory {
  if (history.present === state) return history;
  return {
    past: [...history.past.slice(-99), history.present],
    present: pruneEmptyGroups(state),
    future: [],
  };
}

export function undo(history: EditorHistory): EditorHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: preserveGroupView(previous, history.present),
    future: [history.present, ...history.future],
  };
}

export function redo(history: EditorHistory): EditorHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: preserveGroupView(next, history.present),
    future: history.future.slice(1),
  };
}
