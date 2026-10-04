import { describe, expect, it } from "vitest";
import { abortable } from "./ocr";

describe("OCR cancellation", () => {
  it("releases the UI even if worker initialization never settles", async () => {
    const controller = new AbortController();
    const pending = abortable(new Promise(() => undefined), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("handles a request cancelled before starting", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortable(Promise.resolve("late result"), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
