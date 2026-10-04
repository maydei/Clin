import { describe, expect, it } from "vitest";
import { boundsForPages, clamp, clientToWorld, fitBounds, worldToClient, zoomAt } from "./geometry";

describe("canvas geometry", () => {
  it("round-trips points through the camera transform", () => {
    const camera = { x: 120, y: -40, zoom: 1.75 };
    const world = { x: 310, y: 220 };
    expect(clientToWorld(worldToClient(world, camera), camera)).toEqual(world);
  });

  it("fits bounds with padding and clamps zoom", () => {
    const camera = fitBounds({ x: 100, y: 50, width: 1200, height: 800 }, { width: 900, height: 600 }, 48);
    expect(camera.zoom).toBeGreaterThanOrEqual(0.1);
    expect(camera.zoom).toBeLessThanOrEqual(4);
    expect(camera.x).toBeCloseTo(9, 0);
  });

  it("keeps the client anchor fixed while zooming", () => {
    const camera = { x: 20, y: 30, zoom: 1 };
    const anchor = { x: 220, y: 330 };
    const zoomed = zoomAt(camera, anchor, 20);

    expect(zoomed.zoom).toBe(10);
    expect(worldToClient(clientToWorld(anchor, camera), zoomed)).toEqual(anchor);
    expect(zoomAt(camera, anchor, 0.01).zoom).toBe(0.04);
    expect(clamp(2, 0, 1)).toBe(1);
  });

  it("calculates bounds for sparse page positions", () => {
    expect(boundsForPages([])).toBeNull();
    expect(boundsForPages([
      { x: 20, y: 30, width: 100, height: 200 },
      { x: -40, y: 80, width: 50, height: 20 },
    ])).toEqual({ x: -40, y: 30, width: 160, height: 200 });
    expect(fitBounds({ x: 0, y: 0, width: 0, height: 0 }, { width: 500, height: 500 }).zoom).toBe(10);
  });
});
