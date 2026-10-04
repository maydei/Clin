import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createEditorState } from "./model";
import { decodeProject, encodeProject } from "./project-file";
import type { EditorProject } from "./types";

describe("project file", () => {
  it("round-trips editor state and source PDF bytes", () => {
    const project: EditorProject = {
      version: 1,
      name: "Informe",
      updatedAt: "2026-07-31T12:00:00.000Z",
      state: createEditorState(),
      sources: [{ id: "source-1", name: "informe.pdf", bytes: new Uint8Array([1, 2, 3, 4]), pageCount: 1 }],
    };

    const decoded = decodeProject(encodeProject(project));

    expect(decoded.name).toBe("Informe");
    expect(decoded.sources[0]).toMatchObject({ id: "source-1", name: "informe.pdf", pageCount: 1 });
    expect([...decoded.sources[0].bytes]).toEqual([1, 2, 3, 4]);
  });

  it("rejects unsupported project versions", () => {
    const project: EditorProject = {
      version: 1,
      name: "Test",
      updatedAt: new Date().toISOString(),
      state: createEditorState(),
      sources: [],
    };
    const bytes = encodeProject(project);
    const mutated = new Uint8Array(bytes);

    expect(() => decodeProject(mutated, 2)).toThrow(/versión/i);
  });

  it("rejects archives without a manifest or referenced source", () => {
    expect(() => decodeProject(zipSync({ "readme.txt": strToU8("vacío") }))).toThrow(/no es válido/i);

    const manifest = {
      version: 1,
      name: "Incompleto",
      updatedAt: "2026-07-31T12:00:00.000Z",
      state: createEditorState(),
      sources: [{ id: "source-1", name: "falta.pdf", pageCount: 1, file: "sources/source-1.pdf" }],
    };
    expect(() => decodeProject(zipSync({ "project.json": strToU8(JSON.stringify(manifest)) }))).toThrow(/falta el documento/i);
  });
});
