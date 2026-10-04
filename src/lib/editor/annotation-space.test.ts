import { describe, expect, it } from "vitest";
import { clampPointToPage } from "./annotation-space";

describe("page annotation bounds", () => {
  it("keeps page annotations inside the artboard", () => {
    expect(clampPointToPage({ x: -20, y: 340 }, { width: 200, height: 300 })).toEqual({ x: 0, y: 300 });
    expect(clampPointToPage({ x: 42, y: 80 }, { width: 200, height: 300 })).toEqual({ x: 42, y: 80 });
  });
});
