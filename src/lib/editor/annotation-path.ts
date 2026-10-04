import { getStroke } from "perfect-freehand";
import type { StrokePoint } from "./types";

type StrokeOptions = {
  pressureEnabled?: boolean;
  smoothing?: number;
};

export function strokeToPath(points: StrokePoint[], size: number, options: StrokeOptions = {}) {
  const pressureEnabled = options.pressureEnabled ?? true;
  const normalizedPoints = pressureEnabled
    ? points
    : points.map(([x, y]) => [x, y, 0.5] as StrokePoint);
  const outline = getStroke(normalizedPoints, {
    size,
    thinning: 0.55,
    smoothing: options.smoothing ?? 0.8,
    streamline: 0.58,
    simulatePressure: false,
    start: { cap: true },
    end: { cap: true },
  });
  if (!outline.length) return "";
  const average = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [first, ...rest] = outline;
  let path = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)} Q`;
  for (let index = 0; index < rest.length; index += 1) {
    const point = rest[index];
    const next = rest[(index + 1) % rest.length];
    const midpoint = average(point, next);
    path += ` ${point[0].toFixed(2)} ${point[1].toFixed(2)} ${midpoint[0].toFixed(2)} ${midpoint[1].toFixed(2)}`;
  }
  return `${path} Z`;
}
