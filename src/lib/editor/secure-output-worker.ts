import { protectPdf, signPdf } from "./secure-export";
self.onmessage = async ({ data }) => {
  try {
    const bytes = new Uint8Array(data.operation === "protect" ? await protectPdf(data.bytes, data.options) : await signPdf(data.bytes, data.options));
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "No se pudo completar la operación del PDF." }); }
};
