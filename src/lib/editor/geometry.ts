import type { Camera, Point } from "./types";

export type Bounds = Point & { width: number; height: number };
export type Viewport = { width: number; height: number };

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function worldToClient(point: Point, camera: Camera): Point {
  return {
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y,
  };
}

export function clientToWorld(point: Point, camera: Camera): Point {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

export function zoomAt(camera: Camera, clientPoint: Point, nextZoom: number): Camera {
  const zoom = clamp(nextZoom, 0.04, 10);
  const world = clientToWorld(clientPoint, camera);
  return {
    zoom,
    x: clientPoint.x - world.x * zoom,
    y: clientPoint.y - world.y * zoom,
  };
}

export function fitBounds(bounds: Bounds, viewport: Viewport, padding = 48): Camera {
  const usableWidth = Math.max(1, viewport.width - padding * 2);
  const usableHeight = Math.max(1, viewport.height - padding * 2);
  const zoom = clamp(
    Math.min(usableWidth / Math.max(1, bounds.width), usableHeight / Math.max(1, bounds.height)),
    0.04,
    10,
  );
  return {
    zoom,
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
  };
}

export function boundsForPages(
  pages: Array<{ x: number; y: number; width: number; height: number }>,
): Bounds | null {
  if (!pages.length) return null;
  const left = Math.min(...pages.map((page) => page.x));
  const top = Math.min(...pages.map((page) => page.y));
  const right = Math.max(...pages.map((page) => page.x + page.width));
  const bottom = Math.max(...pages.map((page) => page.y + page.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
