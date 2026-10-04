import { describe, expect, it } from "vitest";
import { createReplacement, searchTextBlocks, searchTextMatches } from "./text-index";
import type { DocumentTextBlock } from "./types";

const blocks: DocumentTextBlock[] = [
  {
    id: "a",
    pageId: "page-1",
    text: "Guía clínica de actuación",
    x: 20,
    y: 40,
    width: 180,
    height: 18,
    fontSize: 14,
    confidence: 99,
    source: "pdf",
  },
  {
    id: "b",
    pageId: "page-2",
    text: "Consentimiento informado",
    x: 30,
    y: 60,
    width: 160,
    height: 20,
    fontSize: 15,
    confidence: 88,
    source: "ocr",
  },
];

describe("text index", () => {
  it("searches case and accent independently", () => {
    expect(searchTextBlocks(blocks, "GUIA clinica").map((item) => item.id)).toEqual(["a"]);
  });

  it("creates a replacement over the exact source bounds", () => {
    expect(createReplacement(blocks[1], "Autorización", "replacement-1")).toMatchObject({
      id: "replacement-1",
      pageId: "page-2",
      type: "replacement",
      sourceTextBlockId: "b",
      text: "Autorización",
      x: 30,
      y: 60,
      width: 160,
      height: 20,
    });
  });
});

describe("individual search matches", () => {
  it("finds each occurrence and limits the highlight to the phrase", () => {
    const line = { ...blocks[0], text: "Tema 9. Contratos. Tema 9. Presupuesto", width: 360 };
    const matches = searchTextMatches([line], "tema 9");
    expect(matches).toHaveLength(2);
    expect(matches.map((match) => match.text)).toEqual(["Tema 9", "Tema 9"]);
    expect(matches[0].width).toBeLessThan(line.width / 4);
    expect(matches[1].x).toBeGreaterThan(matches[0].x + matches[0].width);
  });

  it("uses glyph boxes and preserves offsets after accent and whitespace normalization", () => {
    const line = { ...blocks[0], text: "Guía   clínica", characterBoxes: Array.from({ length: 14 }, (_, i) => ({ x: i * 7, y: 40, width: 7, height: 18 })) };
    const [match] = searchTextMatches([line], "CLINICA");
    expect(match.text).toBe("clínica");
    expect(match.x).toBe(49);
    expect(match.width).toBe(49);
  });

  it("matches phrases split between PDF items but never joins pages", () => {
    const first = { ...blocks[0], text: "Tema", width: 40 };
    const second = { ...first, id: "second", text: "9. Contratos", x: 65, width: 120 };
    const [match] = searchTextMatches([first, second], "tema 9");
    expect(match.rects).toHaveLength(2);
    expect(match.text).toBe("Tema 9");
    expect(searchTextMatches([first, { ...second, pageId: "other" }], "tema 9")).toHaveLength(0);
  });

  it("does not return matches for empty queries", () => {
    expect(searchTextMatches(blocks, "  ")).toEqual([]);
  });
});
