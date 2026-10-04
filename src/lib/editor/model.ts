import { spatialOrder, reorderSpatialDocument } from "./spatial-order";
import { applySelection, pruneEmptyGroups } from "./selection";
import type {
  Annotation,
  CanvasGroup,
  DocumentTextBlock,
  EditorPage,
  EditorState,
  EditorTool,
  GroupExportPreferences,
  GroupOrderMode,
} from "./types";

const normalizeRotation = (rotation: number) => ((rotation % 360) + 360) % 360;

const normalizeOrder = (pages: EditorPage[]) =>
  pages.map((page, order) => ({ ...page, order }));

const defaultGroupExport = (name: string): GroupExportPreferences => ({
  filename: name,
  format: "pdf",
  compression: "editable",
  imageFormat: "jpeg",
});

const normalizePage = (page: EditorPage, index: number): EditorPage => ({
  ...page,
  name: page.name?.trim() || `Página ${index + 1}`,
  groupId: page.groupId ?? null,
});

export function normalizeEditorState(state: EditorState): EditorState {
  const groups = (state.groups ?? []).map((group, order) => ({
    ...group,
    collapsed: group.collapsed === true,
    parentId: group.parentId ?? null,
    order: Number.isFinite(group.order) ? group.order : order,
    orderMode: "manual" as GroupOrderMode,
    exportOrder: group.exportOrder ?? (group.orderMode && group.orderMode !== "manual"
      ? orderedPagesForExport({ ...state, groups: state.groups ?? [] }, group.id).map((page) => page.id)
      : undefined),
    export: { ...defaultGroupExport(group.name), ...(group.export ?? {}) },
  }));
  const groupIds = new Set(groups.map((group) => group.id));
  return pruneEmptyGroups({
    ...state,
    pages: normalizeOrder(
      [...state.pages]
        .sort((a, b) => a.order - b.order)
        .map((page, index) => normalizePage(page, index))
        .map((page) => ({ ...page, groupId: page.groupId && groupIds.has(page.groupId) ? page.groupId : null })),
    ),
    groups,
    annotations: (state.annotations ?? []).map((annotation) => ({ ...annotation, groupId: annotation.groupId && groupIds.has(annotation.groupId) ? annotation.groupId : null })),
    selectedItems: undefined, selectedGroupIds: undefined, selectedAnnotationIds: undefined,
    textBlocks: state.textBlocks ?? [],
    selectedPageIds: state.selectedPageIds ?? [],
    selectedGroupId: state.selectedGroupId ?? null,
    selectedAnnotationId: state.selectedAnnotationId ?? null,
    tool: state.tool ?? "select",
  });
}

export function createEditorState(pages: EditorPage[] = []): EditorState {
  return {
    pages: normalizeOrder([...pages].sort((a, b) => a.order - b.order).map(normalizePage)),
    groups: [],
    annotations: [],
    textBlocks: [],
    selectedPageIds: [],
    selectedGroupId: null,
    selectedAnnotationId: null,
    tool: "select",
  };
}

export function selectPages(state: EditorState, pageIds: string[]): EditorState {
  return applySelection(state, pageIds.map((id) => ({ kind: "page", id })));
}

export function pageIdsForSelection(
  pages: EditorPage[],
  currentIds: string[],
  pageId: string,
  options: { toggle?: boolean; range?: boolean; anchorId?: string | null } = {},
): string[] {
  const orderedIds = [...pages].sort((a, b) => a.order - b.order).map((page) => page.id);
  if (!orderedIds.includes(pageId)) return currentIds;

  if (options.range && options.anchorId) {
    const anchorIndex = orderedIds.indexOf(options.anchorId);
    const pageIndex = orderedIds.indexOf(pageId);
    if (anchorIndex >= 0) {
      const start = Math.min(anchorIndex, pageIndex);
      const end = Math.max(anchorIndex, pageIndex);
      const range = orderedIds.slice(start, end + 1);
      return options.toggle ? [...new Set([...currentIds, ...range])] : range;
    }
  }

  if (options.toggle) {
    return currentIds.includes(pageId)
      ? currentIds.filter((id) => id !== pageId)
      : [...currentIds, pageId];
  }

  return [pageId];
}

export function selectAnnotation(state: EditorState, annotationId: string | null): EditorState {
  return applySelection(state, annotationId ? [{ kind: "annotation", id: annotationId }] : []);
}

export function setTool(state: EditorState, tool: EditorTool): EditorState {
  return { ...state, tool };
}

function descendantGroupIds(state: EditorState, groupId: string): Set<string> {
  const result = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    state.groups.forEach((group) => {
      if (group.parentId && result.has(group.parentId) && !result.has(group.id)) {
        result.add(group.id);
        changed = true;
      }
    });
  }
  return result;
}

export function selectGroup(state: EditorState, groupId: string | null): EditorState {
  if (groupId !== null && !state.groups.some((group) => group.id === groupId)) return state;
  return applySelection(state, groupId ? [{ kind: "group", id: groupId }] : []);
}

export function createGroup(
  state: EditorState,
  pageIds: string[],
  input: Pick<CanvasGroup, "id" | "name" | "parentId">,
): EditorState {
  if (state.groups.some((group) => group.id === input.id)) return state;
  if (input.parentId && !state.groups.some((group) => group.id === input.parentId)) return state;
  const name = input.name.trim() || "Grupo";
  const siblingCount = state.groups.filter((group) => group.parentId === input.parentId).length;
  const pageSet = new Set(pageIds);
  const group: CanvasGroup = {
    ...input,
    name,
    order: siblingCount,
    orderMode: "manual",
    export: defaultGroupExport(name),
  };
  return {
    ...state,
    groups: [...state.groups, group],
    pages: state.pages.map((page) => pageSet.has(page.id) ? { ...page, groupId: group.id } : page),
    selectedGroupId: group.id,
    selectedItems: [{ kind: "group", id: group.id }],
  };
}

export function renameGroup(state: EditorState, groupId: string, name: string): EditorState {
  const nextName = name.trim();
  if (!nextName) return state;
  return {
    ...state,
    groups: state.groups.map((group) => group.id === groupId
      ? { ...group, name: nextName, export: { ...group.export, filename: group.export.filename === group.name ? nextName : group.export.filename } }
      : group),
  };
}

export function updateGroupExport(
  state: EditorState,
  groupId: string,
  patch: Partial<GroupExportPreferences>,
): EditorState {
  return {
    ...state,
    groups: state.groups.map((group) => group.id === groupId
      ? { ...group, export: { ...group.export, ...patch } }
      : group),
  };
}

export function setGroupOrderMode(state: EditorState, groupId: string, orderMode: GroupOrderMode): EditorState {
  const members = orderedPagesForExport(state, groupId);
  const ordered = [...members].sort((a, b) => orderMode === "vertical" ? a.y - b.y || a.x - b.x || a.order - b.order : orderMode === "horizontal" ? a.x - b.x || a.y - b.y || a.order - b.order : a.order - b.order);
  return reorderSpatialDocument(state, ordered.map((page) => page.id), members.map((page) => page.id));
}

export function movePagesToGroup(state: EditorState, pageIds: string[], groupId: string | null): EditorState {
  if (groupId && !state.groups.some((group) => group.id === groupId)) return state;
  const selected = new Set(pageIds);
  return {
    ...state,
    pages: state.pages.map((page) => selected.has(page.id) ? { ...page, groupId } : page),
  };
}

export function ungroupPages(state: EditorState, pageIds: string[]): EditorState {
  const selected = new Set(pageIds);
  const groups = new Map(state.groups.map((group) => [group.id, group]));
  return {
    ...state,
    pages: state.pages.map((page) => selected.has(page.id)
      ? { ...page, groupId: page.groupId ? groups.get(page.groupId)?.parentId ?? null : null }
      : page),
  };
}

export function deleteGroup(state: EditorState, groupId: string): EditorState {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return state;
  return {
    ...state,
    groups: state.groups
      .filter((item) => item.id !== groupId)
      .map((item) => item.parentId === groupId ? { ...item, parentId: group.parentId } : item),
    pages: state.pages.map((page) => page.groupId === groupId ? { ...page, groupId: group.parentId } : page),
    annotations: state.annotations.map((annotation) => annotation.groupId === groupId ? { ...annotation, groupId: group.parentId } : annotation),
    selectedGroupId: state.selectedGroupId === groupId ? null : state.selectedGroupId,
  };
}

export function updatePageName(state: EditorState, pageId: string, name: string): EditorState {
  const nextName = name.trim();
  if (!nextName) return state;
  return {
    ...state,
    pages: state.pages.map((page) => page.id === pageId ? { ...page, name: nextName } : page),
  };
}

export function orderedPagesForExport(state: EditorState, groupId: string | null = null, pageIds?: string[]): EditorPage[] {
  const group = groupId ? state.groups.find((item) => item.id === groupId) : null;
  if (groupId && !group) return [];
  const groupIds = groupId ? descendantGroupIds(state, groupId) : null;
  const selected = pageIds ? new Set(pageIds) : null;
  const pages = state.pages.filter((page) =>
    (!groupIds || (page.groupId !== null && groupIds.has(page.groupId))) && (!selected || selected.has(page.id)),
  );
  return spatialOrder(pages).ordered;
}

export type PageAlignment = "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "distribute-x" | "distribute-y";

export function alignPages(state: EditorState, pageIds: string[], alignment: PageAlignment): EditorState {
  const selected = state.pages.filter((page) => pageIds.includes(page.id));
  if (selected.length < 2) return state;
  const left = Math.min(...selected.map((page) => page.x));
  const top = Math.min(...selected.map((page) => page.y));
  const right = Math.max(...selected.map((page) => page.x + page.width));
  const bottom = Math.max(...selected.map((page) => page.y + page.height));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const positions = new Map<string, { x?: number; y?: number }>();

  if (alignment === "distribute-x" || alignment === "distribute-y") {
    const axis = alignment === "distribute-x" ? "x" : "y";
    const ordered = [...selected].sort((a, b) => a[axis] - b[axis]);
    const first = ordered[0][axis];
    const last = ordered.at(-1)![axis];
    ordered.forEach((page, index) => positions.set(page.id, { [axis]: first + ((last - first) * index) / (ordered.length - 1) }));
  } else {
    selected.forEach((page) => {
      if (alignment === "left") positions.set(page.id, { x: left });
      if (alignment === "center-x") positions.set(page.id, { x: centerX - page.width / 2 });
      if (alignment === "right") positions.set(page.id, { x: right - page.width });
      if (alignment === "top") positions.set(page.id, { y: top });
      if (alignment === "center-y") positions.set(page.id, { y: centerY - page.height / 2 });
      if (alignment === "bottom") positions.set(page.id, { y: bottom - page.height });
    });
  }
  return {
    ...state,
    pages: state.pages.map((page) => positions.has(page.id) ? { ...page, ...positions.get(page.id) } : page),
  };
}

export function arrangePagesInDirection(
  state: EditorState,
  pageIds: string[],
  direction: "horizontal" | "vertical",
  gap = 72,
): EditorState {
  const selected = state.pages.filter((page) => pageIds.includes(page.id)).sort((a, b) => a.order - b.order);
  if (!selected.length) return state;
  let x = Math.min(...selected.map((page) => page.x));
  let y = Math.min(...selected.map((page) => page.y));
  const positions = new Map<string, { x: number; y: number }>();
  selected.forEach((page) => {
    positions.set(page.id, { x, y });
    if (direction === "horizontal") x += page.width + gap;
    else y += page.height + gap;
  });
  return {
    ...state,
    pages: state.pages.map((page) => positions.has(page.id) ? { ...page, ...positions.get(page.id)! } : page),
  };
}

export function movePages(
  state: EditorState,
  pageIds: string[],
  deltaX: number,
  deltaY: number,
): EditorState {
  const selected = new Set(pageIds);
  return {
    ...state,
    pages: state.pages.map((page) =>
      selected.has(page.id)
        ? { ...page, x: page.x + deltaX, y: page.y + deltaY }
        : page,
    ),
  };
}

export function reorderPages(state: EditorState, orderedIds: string[]): EditorState {
  return reorderSpatialDocument(state, orderedIds);
}

export function rotatePages(state: EditorState, pageIds: string[], delta: number): EditorState {
  const selected = new Set(pageIds);
  return {
    ...state,
    pages: state.pages.map((page) =>
      selected.has(page.id)
        ? { ...page, rotation: normalizeRotation(page.rotation + delta) }
        : page,
    ),
  };
}

export function addAnnotation(state: EditorState, annotation: Annotation): EditorState {
  if (annotation.pageId !== null && !state.pages.some((page) => page.id === annotation.pageId)) return state;
  return {
    ...state,
    annotations: [...state.annotations, annotation],
    selectedItems: [{ kind: "annotation", id: annotation.id }],
    selectedGroupIds: [],
    selectedAnnotationIds: [annotation.id],
    selectedAnnotationId: annotation.id,
    selectedPageIds: [],
    selectedGroupId: null,
  };
}

export function setPageTextBlocks(
  state: EditorState,
  pageId: string,
  source: DocumentTextBlock["source"],
  blocks: DocumentTextBlock[],
): EditorState {
  if (!state.pages.some((page) => page.id === pageId)) return state;
  return {
    ...state,
    textBlocks: [
      ...state.textBlocks.filter((block) => block.pageId !== pageId || block.source !== source),
      ...blocks.map((block) => ({ ...block, pageId, source })),
    ],
  };
}

export function updateAnnotation(
  state: EditorState,
  annotationId: string,
  patch: Partial<Annotation>,
): EditorState {
  return {
    ...state,
    annotations: state.annotations.map((annotation) =>
      annotation.id === annotationId
        ? ({ ...annotation, ...patch, id: annotation.id, pageId: annotation.pageId } as Annotation)
        : annotation,
    ),
  };
}

export function moveAnnotation(
  state: EditorState,
  annotationId: string,
  deltaX: number,
  deltaY: number,
): EditorState {
  return {
    ...state,
    annotations: state.annotations.map((annotation) => {
      if (annotation.id !== annotationId) return annotation;
      if (annotation.type !== "text" && annotation.type !== "rectangle" && annotation.type !== "replacement") return annotation;
      const page = annotation.pageId ? state.pages.find((item) => item.id === annotation.pageId) : null;
      const maxX = page ? Math.max(0, (page.sourceWidth ?? page.width) - annotation.width) : Number.POSITIVE_INFINITY;
      const maxY = page ? Math.max(0, (page.sourceHeight ?? page.height) - annotation.height) : Number.POSITIVE_INFINITY;
      return {
        ...annotation,
        x: Math.min(maxX, Math.max(page ? 0 : Number.NEGATIVE_INFINITY, annotation.x + deltaX)),
        y: Math.min(maxY, Math.max(page ? 0 : Number.NEGATIVE_INFINITY, annotation.y + deltaY)),
      };
    }),
  };
}

export function deleteAnnotations(state: EditorState, annotationIds: string[]): EditorState {
  const selected = new Set(annotationIds);
  return {
    ...state,
    annotations: state.annotations.filter((annotation) => !selected.has(annotation.id)),
    selectedAnnotationId: selected.has(state.selectedAnnotationId ?? "")
      ? null
      : state.selectedAnnotationId,
  };
}

export function clearStrokeAnnotations(state: EditorState): EditorState {
  const removed = new Set(
    state.annotations
      .filter((annotation) => annotation.type === "ink" || annotation.type === "highlight")
      .map((annotation) => annotation.id),
  );
  return {
    ...state,
    annotations: state.annotations.filter((annotation) => !removed.has(annotation.id)),
    selectedAnnotationId: state.selectedAnnotationId && removed.has(state.selectedAnnotationId)
      ? null
      : state.selectedAnnotationId,
  };
}

export function clearAnnotationObjects(state: EditorState): EditorState {
  const annotations = state.annotations.filter((annotation) => annotation.type === "replacement");
  return {
    ...state,
    annotations,
    selectedAnnotationId: annotations.some((annotation) => annotation.id === state.selectedAnnotationId)
      ? state.selectedAnnotationId
      : null,
  };
}

export function deletePages(state: EditorState, pageIds: string[]): EditorState {
  const selected = new Set(pageIds);
  return {
    ...state,
    pages: normalizeOrder(state.pages.filter((page) => !selected.has(page.id))),
    annotations: state.annotations.filter((annotation) => annotation.pageId === null || !selected.has(annotation.pageId)),
    textBlocks: state.textBlocks.filter((block) => !selected.has(block.pageId)),
    selectedPageIds: state.selectedPageIds.filter((id) => !selected.has(id)),
    selectedAnnotationId: state.annotations.some(
      (annotation) => annotation.id === state.selectedAnnotationId && annotation.pageId !== null && selected.has(annotation.pageId),
    )
      ? null
      : state.selectedAnnotationId,
  };
}

export function duplicatePages(
  state: EditorState,
  pageIds: string[],
  createId: () => string = () => crypto.randomUUID(),
): EditorState {
  const selected = new Set(pageIds);
  const pages: EditorPage[] = [];
  const annotations = [...state.annotations];
  const duplicatedIds: string[] = [];

  state.pages.forEach((page) => {
    pages.push(page);
    if (!selected.has(page.id)) return;
    const baseId = createId();
    const pageId = `${baseId}-page`;
    pages.push({ ...page, id: pageId, x: page.x + 36, y: page.y + 36 });
    duplicatedIds.push(pageId);
    state.annotations
      .filter((annotation) => annotation.pageId === page.id)
      .forEach((annotation, index) => {
        annotations.push({
          ...annotation,
          id: `${baseId}-annotation-${index}`,
          pageId,
        });
      });
  });

  return {
    ...state,
    pages: normalizeOrder(pages),
    annotations,
    selectedPageIds: duplicatedIds,
    selectedItems: duplicatedIds.map((id) => ({ kind: "page", id })),
    selectedAnnotationIds: [], selectedGroupIds: [],
    selectedAnnotationId: null,
    selectedGroupId: null,
  };
}
