import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { exportPdf } from "./export";
import type { RasterOutputPage } from "./export-task";

self.onmessage = async ({ data }) => {
  try {
    let bytes: Uint8Array;
    if (data.kind === "editable") bytes = await exportPdf(data.state, data.sources, null, data.options);
    else {
      const output = await PDFDocument.create();
      const font = await output.embedFont(StandardFonts.Helvetica);
      for (const item of data.pages as RasterOutputPage[]) {
        const image = await output.embedJpg(item.bytes);
        const page = output.addPage([item.width, item.height]);
        page.drawImage(image, { x: 0, y: 0, width: item.width, height: item.height });
        for (const block of item.blocks) page.drawText(block.text, { x: block.x, y: item.height - block.y - block.fontSize, size: Math.max(4, block.fontSize), font, color: rgb(0, 0, 0), opacity: 0, maxWidth: block.width });
      }
      output.setProducer("clin");
      bytes = await output.save({ useObjectStreams: true, addDefaultPage: false });
    }
    self.postMessage({ bytes }, { transfer: [bytes.buffer as ArrayBuffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
