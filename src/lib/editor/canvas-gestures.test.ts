import { describe, expect, it } from "vitest";
import { cameraForWheel } from "./canvas-gestures";

describe("canvas wheel gestures", () => {
  it("zooms the canvas around the pointer for a trackpad pinch", () => {
    const result = cameraForWheel(
      { x: 0, y: 0, zoom: 1 },
      { x: 200, y: 100 },
      { deltaX: 0, deltaY: -20, ctrlKey: true, metaKey: false, shiftKey: false },
    );
    expect(result.zoom).toBeGreaterThan(1);
    expect(result.x).toBeLessThan(0);
    expect(result.y).toBeLessThan(0);
  });

  it("pans in both axes for a regular two-finger gesture", () => {
    expect(cameraForWheel(
      { x: 20, y: 30, zoom: 1 },
      { x: 0, y: 0 },
      { deltaX: 14, deltaY: -8, ctrlKey: false, metaKey: false, shiftKey: false },
    )).toEqual({ x: 6, y: 38, zoom: 1 });
  });
});
