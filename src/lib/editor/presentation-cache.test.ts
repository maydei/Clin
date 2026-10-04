import { describe, expect, it } from "vitest";
import { presentationPreloadIndices } from "./presentation-cache";

describe("presentation preloading", () => {
  it("preloads up to five pages before and after the current page", () => {
    expect(presentationPreloadIndices(7, 20)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(presentationPreloadIndices(1, 4)).toEqual([0, 1, 2, 3]);
  });
});
