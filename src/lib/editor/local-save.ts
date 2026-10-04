export type OutputDirectoryHandle = {
  name: string;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
      abort?: () => Promise<void>;
    }>;
  }>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<OutputDirectoryHandle>;
};

export function supportsDirectoryPicker() {
  return Boolean(window.clinDesktop?.chooseOutputDirectory) || typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export async function chooseOutputDirectory() {
  const desktop = window.clinDesktop;
  if (desktop?.chooseOutputDirectory) {
    const directory = await desktop.chooseOutputDirectory();
    if (!directory) throw new DOMException("Cancelado", "AbortError");
    return {
      name: directory.name,
      getFileHandle: async (filename: string) => ({
        createWritable: async () => {
          let bytes: Uint8Array | null = null;
          return {
            write: async (data: Blob) => { bytes = new Uint8Array(await data.arrayBuffer()); },
            close: async () => {
              if (!bytes) throw new DOMException("Cancelado", "AbortError");
              if (!await desktop.writeOutputFile(directory.id, filename, bytes)) throw new DOMException("Cancelado", "AbortError");
              bytes = null;
            },
            abort: async () => { bytes = null; },
          };
        },
      }),
    } satisfies OutputDirectoryHandle;
  }
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Este navegador no permite elegir una carpeta de destino.");
  return picker({ mode: "readwrite" });
}

export async function writeBytesToDirectory(
  directory: OutputDirectoryHandle,
  bytes: Uint8Array,
  filename: string,
  type: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const file = await directory.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  const abort = () => { void writable.abort?.().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    await writable.write(new Blob([Uint8Array.from(bytes).buffer], { type }));
    signal?.throwIfAborted();
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  } finally { signal?.removeEventListener("abort", abort); }
}
