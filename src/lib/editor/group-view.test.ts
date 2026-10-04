import { describe, expect, it } from 'vitest';
import { createEditorState, createGroup, movePages } from './model';
import { commit, createHistory, undo, redo } from './history';
import { toggleGroupCollapse, collapseTargets, groupSelectionInGrid } from './group-view';
import { applySelection } from './selection';
import { encodeProject, decodeProject } from './project-codec';
const pages = Array.from({length: 5}, (_, i) => ({id: `p${i}`, name: `Page ${i}`, groupId: null, sourceId: 's', sourcePageIndex: i, order: i, x: i*30, y: i*40, width: 100, height: 150, rotation: 0}));
const grouped = () => createGroup(createEditorState(pages), pages.map(p=>p.id), {id:'g', name:'Group', parentId:null});
describe('persistent group view', () => {
 it('targets the group of a selected page without moving pages', () => {
  const state = applySelection(grouped(), [{kind:'page', id:'p1'}]);
  expect(collapseTargets(state)).toEqual(['g']);
  const collapsed = toggleGroupCollapse(state);
  expect(collapsed.groups[0].collapsed).toBe(true);
  expect(collapsed.pages).toBe(state.pages);
  expect(toggleGroupCollapse(collapsed).groups[0].collapsed).toBe(false);
 });
 it('keeps collapse outside movement undo and redo', () => {
  const initial = createHistory(grouped());
  const moved = commit(initial, movePages(initial.present, ['p0'], 40, 20));
  const collapsed = {...moved, present: toggleGroupCollapse(moved.present, ['g'])};
  const undone = undo(collapsed);
  expect(undone.present.pages[0].x).toBe(0);
  expect(undone.present.groups[0].collapsed).toBe(true);
  expect(redo(undone).present.groups[0].collapsed).toBe(true);
 });
 it('arranges a new group without overlap', () => {
  const state = applySelection(createEditorState(pages), pages.map(p=>({kind:'page' as const,id:p.id})));
  const next = groupSelectionInGrid(state, 'new');
  expect(next.groups).toHaveLength(1);
  for (const a of next.pages) for (const b of next.pages) if(a.id!==b.id) expect(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y).toBe(true);
 });
 it('round trips collapse in project data', () => {
  const state=toggleGroupCollapse(grouped(), ['g']);
  const decoded=decodeProject(encodeProject({version:1, name:'test', state, sources:[], updatedAt:new Date().toISOString()}));
  expect(decoded.state.groups[0].collapsed).toBe(true);
 });
});

it('keeps rotated sheets apart when creating a grid', () => {
 const source=pages.map((p,i)=>({...p,rotation:i%2?90:0,width:100,height:250}));
 const state=applySelection(createEditorState(source),source.map(p=>({kind:'page' as const,id:p.id})));
 const next=groupSelectionInGrid(state,'rotated');
 const boxes=next.pages.map(p=>({x:p.x+(p.rotation? -75:0),y:p.y+(p.rotation?75:0),width:p.rotation?250:100,height:p.rotation?100:250}));
 for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
  const a=boxes[i],b=boxes[j]; expect(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y).toBe(true);
 }
});
