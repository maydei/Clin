import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseOutputDirectory, supportsDirectoryPicker, writeBytesToDirectory, type OutputDirectoryHandle } from "./local-save";

describe("local export destination", () => {
  it("writes the generated file into the chosen directory", async () => {
    const write = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const getFileHandle = vi.fn(async () => ({ createWritable: async () => ({ write, close }) }));
    const directory = { name: "Entregas", getFileHandle } as OutputDirectoryHandle;

    await writeBytesToDirectory(directory, new Uint8Array([1, 2, 3]), "informe.pdf", "application/pdf");

    expect(getFileHandle).toHaveBeenCalledWith("informe.pdf", { create: true });
    expect(write).toHaveBeenCalledWith(expect.any(Blob));
    expect(close).toHaveBeenCalledOnce();
  });
});


afterEach(() => { delete window.clinDesktop; });

describe("desktop export destination", () => {
  function desktop() {
    const bridge = {
      platform: "win32", onOpenFiles: vi.fn(() => () => {}),
      chooseOutputDirectory: vi.fn(async (): Promise<{ id: string; name: string } | null> => ({ id: "chosen", name: "C:\\Entregas" })),
      writeOutputFile: vi.fn(async () => true),
    };
    window.clinDesktop = bridge;
    return bridge;
  }
  it("selects the native folder and writes through its granted handle", async () => {
    const bridge = desktop();
    expect(supportsDirectoryPicker()).toBe(true);
    const directory = await chooseOutputDirectory();
    expect(directory.name).toBe("C:\\Entregas");
    const writable = await (await directory.getFileHandle("informe.pdf", { create: true })).createWritable();
    await writable.write({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob);
    await writable.close();
    expect(bridge.writeOutputFile).toHaveBeenCalledWith("chosen", "informe.pdf", new Uint8Array([1, 2, 3]));
  });
  it("treats a canceled folder dialog as cancellation", async () => {
    const bridge = desktop();
    bridge.chooseOutputDirectory.mockResolvedValue(null);
    await expect(chooseOutputDirectory()).rejects.toMatchObject({ name: "AbortError" });
    expect(bridge.writeOutputFile).not.toHaveBeenCalled();
  });
  it("does not write an aborted export", async () => {
    const bridge = desktop();
    const directory = await chooseOutputDirectory();
    const controller = new AbortController();
    controller.abort();
    await expect(writeBytesToDirectory(directory, new Uint8Array([1]), "informe.pdf", "application/pdf", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(bridge.writeOutputFile).not.toHaveBeenCalled();
  });
});
