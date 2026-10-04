import { describe, expect, it } from "vitest";
import { strokeToPath } from "./annotation-path";
import type { StrokePoint } from "./types";

const lowPressure: StrokePoint[] = [[0, 0, 0.1], [20, 10, 0.1], [40, 0, 0.1]];
const highPressure: StrokePoint[] = [[0, 0, 0.9], [20, 10, 0.9], [40, 0, 0.9]];

describe("stroke path", () => {
  it("ignores hardware pressure when pressure support is disabled", () => {
    expect(strokeToPath(lowPressure, 8, { pressureEnabled: false, smoothing: 0.8 }))
      .toBe(strokeToPath(highPressure, 8, { pressureEnabled: false, smoothing: 0.8 }));
  });

  it("keeps hardware pressure when support is enabled", () => {
    expect(strokeToPath(lowPressure, 8, { pressureEnabled: true, smoothing: 0.8 }))
      .not.toBe(strokeToPath(highPressure, 8, { pressureEnabled: true, smoothing: 0.8 }));
  });
});
