export {};

declare global {
  type ClinDesktopFile = {
    name: string;
    type: "application/pdf" | "application/vnd.clin.project";
    bytes: ArrayBuffer;
  };

  interface Window {
    clinDesktop?: {
      onOpenFiles: (callback: (files: ClinDesktopFile[]) => void) => () => void;
      platform: string;
      getWindowState?: () => Promise<{ zen: boolean }>;
      setZen?: (enabled: boolean) => Promise<boolean>;
      getTextScale?: () => Promise<number>;
      onWindowState?: (callback: (state: { zen: boolean }) => void) => () => void;
      saveProjectFile?: (filename: string, bytes: Uint8Array) => Promise<boolean>;
      chooseOutputDirectory: () => Promise<{ id: string; name: string } | null>;
      writeOutputFile: (id: string, filename: string, bytes: Uint8Array) => Promise<boolean>;
    };
  }
}
