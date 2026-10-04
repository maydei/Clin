import { boundsForPages, fitBounds } from "./geometry";
import type { EditorPage } from "./types";

/** Shared by toolbar, context menu, page tree and double click. */
export function cameraToFitPages(pages: EditorPage[], root: HTMLElement | null) {
  const bounds = boundsForPages(pages.map((page) => {
    const radians = page.rotation * Math.PI / 180;
    const width = Math.abs(Math.cos(radians)) * page.width + Math.abs(Math.sin(radians)) * page.height;
    const height = Math.abs(Math.sin(radians)) * page.width + Math.abs(Math.cos(radians)) * page.height;
    return { x: page.x + (page.width - width) / 2, y: page.y + (page.height - height) / 2, width, height };
  }));
  if (!bounds) return null;
  const container = root?.closest("main")?.parentElement;
  const left = container?.querySelector('[data-testid="pages-panel"]')?.getBoundingClientRect().width ?? 0;
  const right = container?.querySelector('[data-testid="inspector-panel"]')?.getBoundingClientRect().width ?? 0;
  const camera = fitBounds(bounds, { width: Math.max(1, (root?.clientWidth ?? window.innerWidth) - left - right), height: root?.clientHeight ?? window.innerHeight - 80 }, 64);
  return { ...camera, x: camera.x + left };
}
