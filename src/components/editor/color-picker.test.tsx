import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./color-picker";

describe("ColorPicker", () => {
  it("accepts a hexadecimal color without opening the browser color dialog", async () => {
    const onChange = vi.fn();
    render(<ColorPicker label="Color de anotación" value="#e11d48" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Color de anotación" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Color hexadecimal" }), { target: { value: "#123456" } });

    expect(onChange).toHaveBeenLastCalledWith("#123456");
  });

  it("uses the system eyedropper when it is available", async () => {
    const onChange = vi.fn();
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: class { async open() { return { sRGBHex: "#fedcba" }; } },
    });
    render(<ColorPicker label="Color del texto" value="#000000" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Color del texto" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Color del texto" })).getByRole("button", { name: "Cuentagotas" }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("#fedcba"));
  });
});
