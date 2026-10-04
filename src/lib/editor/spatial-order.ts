import type { EditorPage, EditorState } from "./types";

function footprint(page: EditorPage) {
  const angle = page.rotation * Math.PI / 180;
  const width = Math.abs(Math.cos(angle)) * page.width + Math.abs(Math.sin(angle)) * page.height;
  const height = Math.abs(Math.sin(angle)) * page.width + Math.abs(Math.cos(angle)) * page.height;
  return { page, x: page.x + (page.width - width) / 2, y: page.y + (page.height - height) / 2, width, height };
}

export function spatialOrder(pages: EditorPage[]) {
  const candidates = pages.map(footprint).sort((a, b) => a.y - b.y || a.x - b.x || a.page.order - b.page.order || a.page.id.localeCompare(b.page.id));
  const rows: Array<{ anchor: ReturnType<typeof footprint>; items: ReturnType<typeof footprint>[] }> = [];
  for (const item of candidates) {
    // Compare with the row anchor, not its evolving bounds: avoids chained rows.
    const row = rows.find(({ anchor }) => {
      const overlap = Math.min(anchor.y + anchor.height, item.y + item.height) - Math.max(anchor.y, item.y);
      return overlap >= Math.min(anchor.height, item.height) * 0.5;
    });
    if (row) row.items.push(item); else rows.push({ anchor: item, items: [item] });
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x || a.y - b.y || a.page.order - b.page.order || a.page.id.localeCompare(b.page.id));
  const ordered = rows.flatMap((row) => row.items.map((item) => item.page));
  const tolerance = (a: number, b: number) => Math.max(12, Math.min(a, b) * 0.08);
  const aligned = rows.every(({ items, anchor }) => items.every((item, index) =>
    Math.abs(item.y - anchor.y) <= tolerance(item.height, anchor.height) &&
    (index === 0 || item.x >= items[index - 1].x + items[index - 1].width - 1),
  )) && rows.every((row, index) => index === 0 || (
    Math.min(...row.items.map((item) => item.y)) >= Math.max(...rows[index - 1].items.map((item) => item.y + item.height)) - 1 &&
    Math.abs(row.items[0].x - rows[0].items[0].x) <= tolerance(row.items[0].width, rows[0].items[0].width)
  ));
  return { ordered, aligned };
}

export function prepareSpatialDocument(state: EditorState, pageIds?: string[], forceGrid = false) {
  const scope = pageIds ? new Set(pageIds) : new Set(state.pages.map((page) => page.id));
  const { ordered, aligned } = spatialOrder(state.pages.filter((page) => scope.has(page.id)));
  if (!ordered.length) return { state, pages: ordered, arranged: false };
  const ranks = ordered.map((page) => page.order).sort((a, b) => a - b);
  const patches = new Map<string, EditorPage>();
  const arrange = forceGrid || !aligned;
  const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const startX = Math.min(...ordered.map((page) => footprint(page).x));
  let x = startX, y = Math.min(...ordered.map((page) => footprint(page).y)), rowHeight = 0;
  ordered.forEach((page, index) => {
    const box = footprint(page);
    patches.set(page.id, { ...page, order: ranks[index], ...(arrange ? { x: x + (box.width - page.width) / 2, y: y + (box.height - page.height) / 2 } : {}) });
    rowHeight = Math.max(rowHeight, box.height);
    if ((index + 1) % columns === 0) { x = startX; y += rowHeight + 72; rowHeight = 0; } else x += box.width + 72;
  });
  const pages = state.pages.map((page) => patches.get(page.id) ?? page).sort((a, b) => a.order - b.order);
  // Update group positions in the tree without changing membership or hierarchy.
  const firstOrder = new Map<string, number>();
  const parents = new Map(state.groups.map((group) => [group.id, group.parentId]));
  for (const page of pages) {
    let id = page.groupId; const seen = new Set<string>();
    while (id && !seen.has(id)) { seen.add(id); firstOrder.set(id, Math.min(firstOrder.get(id) ?? Infinity, page.order)); id = parents.get(id) ?? null; }
  }
  const groups = state.groups.map((group) => ({ ...group, order: firstOrder.get(group.id) ?? group.order, orderMode: "manual" as const, exportOrder: undefined }));
  const changed = pages.some((page, index) => { const old = state.pages[index]; return !old || old.id !== page.id || old.order !== page.order || old.x !== page.x || old.y !== page.y; }) || groups.some((group, index) => group.order !== state.groups[index].order || state.groups[index].exportOrder !== undefined || state.groups[index].orderMode !== "manual");
  const next = changed ? { ...state, pages, groups } : state;
  return { state: next, pages: ordered.map((page) => patches.get(page.id)!), arranged: arrange };
}

/** Explicit reorder also lays out pages, so the spatial export preserves it. */
export function reorderSpatialDocument(state: EditorState, ids: string[], scopeIds?: string[]): EditorState {
  const scope = scopeIds ? new Set(scopeIds) : null;
  const members = state.pages.filter((page) => !scope || scope.has(page.id));
  const byId = new Map(members.map((page) => [page.id, page]));
  const seen = new Set<string>();
  const ordered = [...ids, ...members.slice().sort((a, b) => a.order - b.order).map((page) => page.id)]
    .flatMap((id) => { const page = byId.get(id); if (!page || seen.has(id)) return []; seen.add(id); return [page]; });
  if (!ordered.length) return state;
  const columns = Math.ceil(Math.sqrt(ordered.length));
  const startX = Math.min(...ordered.map((page) => footprint(page).x));
  let x = startX, y = Math.min(...ordered.map((page) => footprint(page).y)), rowHeight = 0;
  const ranks = members.map((page) => page.order).sort((a, b) => a - b);
  const pages = ordered.map((page, index) => {
    const box = footprint(page);
    const next = { ...page, order: ranks[index], x: x + (box.width - page.width) / 2, y: y + (box.height - page.height) / 2 };
    rowHeight = Math.max(rowHeight, box.height);
    if ((index + 1) % columns === 0) { x = startX; y += rowHeight + 72; rowHeight = 0; } else x += box.width + 72;
    return next;
  });
  const patches = new Map(pages.map((page) => [page.id, page]));
  return prepareSpatialDocument({ ...state, pages: state.pages.map((page) => patches.get(page.id) ?? page).sort((a, b) => a.order - b.order) }, scopeIds).state;
}
