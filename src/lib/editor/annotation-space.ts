import { clamp } from "./geometry";
import type { Point } from "./types";

export function clampPointToPage(
  point: Point,
  page: { width: number; height: number },
): Point {
  return {
    x: clamp(point.x, 0, page.width),
    y: clamp(point.y, 0, page.height),
  };
}
