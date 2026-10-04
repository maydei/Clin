import type { EditorPage, EditorState } from "./types";
export type CropRect = { x: number; y: number; width: number; height: number };
export function cropPage(state: EditorState, id: string, rectangle: CropRect | null): EditorState {
  const page = state.pages.find((item) => item.id === id);
  if (!page) return state;
  const sourceWidth = page.sourceWidth ?? page.width, sourceHeight = page.sourceHeight ?? page.height;
  const crop = rectangle ? {
    x: Math.max(0, Math.min(sourceWidth - 1, rectangle.x)), y: Math.max(0, Math.min(sourceHeight - 1, rectangle.y)),
    width: Math.max(1, rectangle.width), height: Math.max(1, rectangle.height),
  } : null;
  if (crop) { crop.width = Math.min(crop.width, sourceWidth - crop.x); crop.height = Math.min(crop.height, sourceHeight - crop.y); }
  const original = sourcePageFrame(page);
  const width = crop?.width ?? sourceWidth, height = crop?.height ?? sourceHeight;
  const dx = (crop?.x ?? 0) + width / 2 - sourceWidth / 2;
  const dy = (crop?.y ?? 0) + height / 2 - sourceHeight / 2;
  const angle = page.rotation * Math.PI / 180;
  const x = original.x + sourceWidth / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy - width / 2;
  const y = original.y + sourceHeight / 2 + Math.sin(angle) * dx + Math.cos(angle) * dy - height / 2;
  return { ...state, pages: state.pages.map((item) => item.id === id ? { ...item, sourceWidth, sourceHeight, crop, width, height, x, y } : item) };
}
export function sourcePageFrame(page: EditorPage): EditorPage {
  const width = page.sourceWidth ?? page.width, height = page.sourceHeight ?? page.height;
  const dx = (page.crop?.x ?? 0) + page.width / 2 - width / 2, dy = (page.crop?.y ?? 0) + page.height / 2 - height / 2;
  const angle = page.rotation * Math.PI / 180;
  return { ...page, x: page.x + page.width / 2 - Math.cos(angle) * dx + Math.sin(angle) * dy - width / 2, y: page.y + page.height / 2 - Math.sin(angle) * dx - Math.cos(angle) * dy - height / 2, width, height };
}
