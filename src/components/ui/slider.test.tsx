import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Slider } from "./slider";

describe("Slider", () => {
  it("renders one visible thumb for a scalar value", () => {
    const { container } = render(<Slider min={0} max={1} value={0.5} />);
    expect(container.querySelectorAll('[data-slot="slider-thumb"]')).toHaveLength(1);
    expect(container.querySelector('[data-slot="slider-track"]')).toBeVisible();
  });
});
