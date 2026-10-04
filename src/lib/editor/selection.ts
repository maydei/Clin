import type { EditorState } from "./types";
export type SelectionItem = { kind: "page" | "group" | "annotation"; id: string };
export const selectionKey = (item: SelectionItem) => `${item.kind}:${item.id}`;
export function explicitSelection(state: EditorState): SelectionItem[] {
  return state.selectedItems ?? [
    ...state.selectedPageIds.map((id) => ({ kind: "page" as const, id })),
    ...(state.selectedGroupId ? [{ kind: "group" as const, id: state.selectedGroupId }] : []),
    ...(state.selectedAnnotationId ? [{ kind: "annotation" as const, id: state.selectedAnnotationId }] : []),
  ];
}
export function groupDescendants(state: EditorState, ids: string[]) {
  const result = new Set(ids); let changed = true;
  while (changed) { changed = false; for (const group of state.groups) if (group.parentId && result.has(group.parentId) && !result.has(group.id)) { result.add(group.id); changed = true; } }
  return result;
}
export function applySelection(state: EditorState, input: SelectionItem[]): EditorState {
  const available = new Set([...state.pages.map((page) => `page:${page.id}`), ...state.groups.map((group) => `group:${group.id}`), ...state.annotations.map((annotation) => `annotation:${annotation.id}`)]);
  const items = [...new Map(input.filter((item) => available.has(selectionKey(item))).map((item) => [selectionKey(item), item])).values()];
  const groupIds = items.filter((item) => item.kind === "group").map((item) => item.id);
  const groups = groupDescendants(state, groupIds);
  const pages = new Set(items.filter((item) => item.kind === "page").map((item) => item.id));
  const annotations = new Set(items.filter((item) => item.kind === "annotation").map((item) => item.id));
  for (const page of state.pages) if (page.groupId && groups.has(page.groupId)) pages.add(page.id);
  for (const annotation of state.annotations) if (annotation.groupId && groups.has(annotation.groupId)) annotations.add(annotation.id);
  return { ...state, selectedItems: items, selectedGroupIds: groupIds, selectedPageIds: [...pages], selectedAnnotationIds: [...annotations], selectedGroupId: groupIds.length === 1 ? groupIds[0] : null, selectedAnnotationId: annotations.size === 1 && !pages.size && !groupIds.length ? [...annotations][0] : null };
}
export function selectTreeItem(state: EditorState, item: SelectionItem, rows: SelectionItem[], anchor: SelectionItem | null, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
  const current = explicitSelection(state);
  const additive = modifiers.ctrlKey || modifiers.metaKey;
  if (modifiers.shiftKey && anchor) {
    const from = rows.findIndex((row) => selectionKey(row) === selectionKey(anchor));
    const to = rows.findIndex((row) => selectionKey(row) === selectionKey(item));
    if (from >= 0 && to >= 0) return applySelection(state, [...(additive ? current : []), ...rows.slice(Math.min(from, to), Math.max(from, to) + 1)]);
  }
  if (!additive) return applySelection(state, [item]);
  return applySelection(state, current.some((row) => selectionKey(row) === selectionKey(item)) ? current.filter((row) => selectionKey(row) !== selectionKey(item)) : [...current, item]);
}
export function pruneEmptyGroups(state: EditorState): EditorState {
  const retained = new Set<string>();
  const parents = new Map(state.groups.map((group) => [group.id, group.parentId]));
  const keep = (initial: string | null | undefined) => { let id = initial; const seen = new Set<string>(); while (id && !seen.has(id) && parents.has(id)) { seen.add(id); retained.add(id); id = parents.get(id); } };
  state.pages.forEach((page) => keep(page.groupId)); state.annotations.forEach((annotation) => keep(annotation.groupId));
  const groups = state.groups.filter((group) => retained.has(group.id));
  const next = groups.length === state.groups.length ? state : { ...state, groups };
  return state.selectedItems ? applySelection(next, state.selectedItems) : { ...next, selectedGroupId: next.selectedGroupId && retained.has(next.selectedGroupId) ? next.selectedGroupId : null };
}
export function groupSelection(state: EditorState, id: string, name = "Grupo"): EditorState {
  const items = explicitSelection(state);
  if (!items.length) return state;
  const selectedGroups = new Set(items.filter((item) => item.kind === "group").map((item) => item.id));
  const descendants = groupDescendants(state, [...selectedGroups]);
  const pages = new Set(items.filter((item) => item.kind === "page").map((item) => item.id));
  const annotations = new Set(items.filter((item) => item.kind === "annotation").map((item) => item.id));
  const parents = new Map(state.groups.map((group) => [group.id, group.parentId]));
  const covered = (parent: string | null) => { const seen = new Set<string>(); while (parent && !seen.has(parent)) { if (selectedGroups.has(parent)) return true; seen.add(parent); parent = parents.get(parent) ?? null; } return false; };
  const groups = state.groups.map((group) => selectedGroups.has(group.id) && !covered(group.parentId) ? { ...group, parentId: id } : group);
  groups.push({ id, name, parentId: null, order: Math.min(...state.pages.filter((page) => state.selectedPageIds.includes(page.id)).map((page) => page.order), state.groups.length), orderMode: "manual", export: { filename: name, format: "pdf", compression: "editable", imageFormat: "jpeg" } });
  return applySelection({ ...state, groups,
    pages: state.pages.map((page) => pages.has(page.id) && !(page.groupId && descendants.has(page.groupId)) ? { ...page, groupId: id } : page),
    annotations: state.annotations.map((annotation) => annotations.has(annotation.id) && !(annotation.groupId && descendants.has(annotation.groupId)) ? { ...annotation, groupId: id } : annotation),
  }, [{ kind: "group", id }]);
}
export function ungroupSelection(state: EditorState): EditorState {
  const items = explicitSelection(state);
  const selected = new Set(items.filter((item) => item.kind === "group").map((item) => item.id));
  const parents = new Map(state.groups.map((group) => [group.id, group.parentId]));
  const survivingParent = (id: string | null | undefined): string | null => { const seen = new Set<string>(); while (id && selected.has(id) && !seen.has(id)) { seen.add(id); id = parents.get(id); } return id ?? null; };
  const explicitPages = new Set(items.filter((item) => item.kind === "page").map((item) => item.id));
  const explicitAnnotations = new Set(items.filter((item) => item.kind === "annotation").map((item) => item.id));
  const next = { ...state,
    groups: state.groups.filter((group) => !selected.has(group.id)).map((group) => ({ ...group, parentId: survivingParent(group.parentId) })),
    pages: state.pages.map((page) => ({ ...page, groupId: survivingParent(explicitPages.has(page.id) && page.groupId ? parents.get(page.groupId) : page.groupId) })),
    annotations: state.annotations.map((annotation) => ({ ...annotation, groupId: survivingParent(explicitAnnotations.has(annotation.id) && annotation.groupId ? parents.get(annotation.groupId) : annotation.groupId) })),
  };
  return pruneEmptyGroups(applySelection(next, [...state.selectedPageIds.map((id) => ({ kind: "page" as const, id })), ...(state.selectedAnnotationIds ?? []).map((id) => ({ kind: "annotation" as const, id }))]));
}

// A single history operation for pages and their selected independent board marks.
export function moveMixedSelection(state: EditorState, pageIds: string[], annotationIds: string[], dx: number, dy: number): EditorState {
  const pages = new Set(pageIds), annotations = new Set(annotationIds);
  return { ...state,
    pages: state.pages.map((page) => pages.has(page.id) ? { ...page, x: page.x + dx, y: page.y + dy } : page),
    annotations: state.annotations.map((annotation) => {
      if (!annotations.has(annotation.id) || (annotation.pageId && pages.has(annotation.pageId))) return annotation;
      let x = dx, y = dy;
      if (annotation.pageId) {
        const page = state.pages.find((page) => page.id === annotation.pageId);
        const angle = -(page?.rotation ?? 0) * Math.PI / 180;
        x = Math.cos(angle) * dx - Math.sin(angle) * dy; y = Math.sin(angle) * dx + Math.cos(angle) * dy;
      }
      if ("points" in annotation) return { ...annotation, points: annotation.points.map(([px, py, pressure]) => [px + x, py + y, pressure] as [number, number, number]) };
      return { ...annotation, x: annotation.x + x, y: annotation.y + y };
    }),
  };
}

export function duplicateSelection(state: EditorState, createId: () => string = () => crypto.randomUUID()): EditorState {
  const selection = applySelection(state, explicitSelection(state));
  if (!explicitSelection(selection).length) return state;
  const groups = groupDescendants(state, selection.selectedGroupIds ?? []);
  const groupIds = new Map([...groups].map((id) => [id, createId()]));
  const pageIds = new Map(selection.selectedPageIds.map((id) => [id, createId()]));
  const annotationIds = new Map(state.annotations.filter((annotation) => (annotation.pageId && pageIds.has(annotation.pageId)) || selection.selectedAnnotationIds?.includes(annotation.id)).map((annotation) => [annotation.id, createId()]));
  const copiedGroups = state.groups.filter((group) => groups.has(group.id)).map((group) => ({ ...group, id: groupIds.get(group.id)!, parentId: group.parentId ? groupIds.get(group.parentId) ?? group.parentId : null, exportOrder: undefined }));
  const pages = state.pages.flatMap((page) => pageIds.has(page.id) ? [page, { ...page, id: pageIds.get(page.id)!, groupId: page.groupId ? groupIds.get(page.groupId) ?? page.groupId : null, x: page.x + 36, y: page.y + 36 }] : [page]).map((page, order) => ({ ...page, order }));
  const blockIds = new Map(state.textBlocks.filter((block) => pageIds.has(block.pageId)).map((block) => [block.id, createId()]));
  const copies = state.annotations.filter((annotation) => annotationIds.has(annotation.id)).map((annotation) => {
    const copied = { ...annotation, id: annotationIds.get(annotation.id)!, pageId: annotation.pageId ? pageIds.get(annotation.pageId) ?? annotation.pageId : null, groupId: annotation.groupId ? groupIds.get(annotation.groupId) ?? annotation.groupId : null };
    if (copied.type === "replacement") copied.sourceTextBlockId = blockIds.get(copied.sourceTextBlockId) ?? copied.sourceTextBlockId;
    if (annotation.pageId && pageIds.has(annotation.pageId)) return copied;
    if ("points" in copied) return { ...copied, points: copied.points.map(([x, y, pressure]) => [x + 36, y + 36, pressure] as [number, number, number]) };
    return { ...copied, x: copied.x + 36, y: copied.y + 36 };
  });
  const copiedSelection = explicitSelection(selection).map((item) => ({ ...item, id: (item.kind === "page" ? pageIds : item.kind === "group" ? groupIds : annotationIds).get(item.id)! }));
  return applySelection({ ...state, groups: [...state.groups, ...copiedGroups], pages, annotations: [...state.annotations, ...copies], textBlocks: [...state.textBlocks, ...state.textBlocks.filter((block) => pageIds.has(block.pageId)).map((block) => ({ ...block, id: blockIds.get(block.id)!, pageId: pageIds.get(block.pageId)! }))] }, copiedSelection);
}
