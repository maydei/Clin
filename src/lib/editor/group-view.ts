import type { EditorState, EditorPage } from './types';
import { explicitSelection, groupSelection, groupDescendants, moveMixedSelection } from './selection';
import { boundsForPages } from './geometry';

export function visualPageBounds(page: EditorPage) {
  const radians = page.rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians)), sine = Math.abs(Math.sin(radians));
  const width = Math.round((page.width * cosine + page.height * sine) * 1000) / 1000;
  const height = Math.round((page.height * cosine + page.width * sine) * 1000) / 1000;
  return { x: page.x + (page.width - width) / 2, y: page.y + (page.height - height) / 2, width, height };
}

export function collapseTargets(state: EditorState): string[] {
  const targets = new Set<string>();
  for (const item of explicitSelection(state)) {
    const id = item.kind === 'group' ? item.id : item.kind === 'page' ? state.pages.find(p => p.id === item.id)?.groupId : null;
    if (id) targets.add(id);
  }
  const parents = new Map(state.groups.map(g => [g.id, g.parentId]));
  return [...targets].filter(id => {
    if (!parents.has(id)) return false;
    let parent = parents.get(id); const seen = new Set<string>();
    while (parent && !seen.has(parent)) { if (targets.has(parent)) return false; seen.add(parent); parent = parents.get(parent); }
    return true;
  });
}
export function toggleGroupCollapse(state: EditorState, ids = collapseTargets(state)): EditorState {
  const targets = new Set(ids);
  if (!state.groups.some(g => targets.has(g.id))) return state;
  const collapsed = state.groups.some(g => targets.has(g.id) && !g.collapsed);
  return { ...state, groups: state.groups.map(g => targets.has(g.id) ? { ...g, collapsed } : g) };
}
// Preserve nested groups as units when arranging a newly created parent.
export function groupSelectionInGrid(state: EditorState, id: string, name = 'Grupo'): EditorState {
  const next = groupSelection(state, id, name);
  if (next === state) return state;
  const units = [
    ...next.pages.filter(p => p.groupId === id).map(p => ({ pages: [p], annotations: [] as string[] })),
    ...next.groups.filter(g => g.parentId === id).map(g => {
      const descendants = groupDescendants(next, [g.id]);
      return { pages: next.pages.filter(p => p.groupId && descendants.has(p.groupId)), annotations: next.annotations.filter(a => a.groupId && descendants.has(a.groupId)).map(a => a.id) };
    }),
  ].filter(u => u.pages.length);
  if (!units.length) return next;
  const boxes = units.map(u => boundsForPages(u.pages.map(visualPageBounds))!);
  const origin = boundsForPages(units.flatMap(u => u.pages).map(visualPageBounds))!;
  const columns = Math.ceil(Math.sqrt(units.length));
  const width = Math.max(...boxes.map(b => b.width)) + 32;
  const height = Math.max(...boxes.map(b => b.height)) + 32;
  return units.reduce((current, unit, i) => moveMixedSelection(current, unit.pages.map(p => p.id), unit.annotations, origin.x + i % columns * width - boxes[i].x, origin.y + Math.floor(i / columns) * height - boxes[i].y), next);
}
export function preserveGroupView(target: EditorState, current: EditorState): EditorState {
  const view = new Map(current.groups.map(g => [g.id, g.collapsed === true]));
  let changed = false;
  const groups = target.groups.map(g => {
    if (!view.has(g.id) || (g.collapsed === true) === view.get(g.id)) return g;
    changed = true; return { ...g, collapsed: view.get(g.id) };
  });
  return changed ? { ...target, groups } : target;
}
