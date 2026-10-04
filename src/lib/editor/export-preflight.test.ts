import { describe, expect, it, vi } from "vitest";
import { createEditorState } from "./model";
import { exportRasterPdf } from "./raster-export";
import { exportPageImage, exportPageImages } from "./image-export";
import { printEditorPages } from "./print-export";

const state = createEditorState([{ id: "page", name: "Contrato", sourceId: "absent", sourcePageIndex: 0, groupId: null, order: 0, x: 0, y: 0, width: 300, height: 400, rotation: 0 }]);

describe("missing originals in every output format", () => {
  it.each([
    ["raster PDF", () => exportRasterPdf(state, new Map(), "balanced")],
    ["single image", () => exportPageImage(state, new Map(), "page", "png")],
    ["image ZIP", () => exportPageImages(state, new Map(), null, "png")],
    ["print", () => printEditorPages(state, new Map(), null)],
  ] as const)("blocks %s before creating a canvas or print window", async (_name, run) => {
    const create = vi.spyOn(document, "createElement");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      await expect(run()).rejects.toThrow("faltan originales para estas páginas: Contrato");
      expect(create).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    } finally { create.mockRestore(); open.mockRestore(); }
  });
});
