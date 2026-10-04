import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { PDF } from "@libpdf/core";
import { protectPdf } from "./secure-export";

describe("secure PDF export", () => {
  it("encrypts an exported PDF with an AES-256 user password", async () => {
    const source = await PDFDocument.create();
    source.addPage([200, 200]);
    const protectedBytes = await protectPdf(await source.save(), {
      userPassword: "secreto-123",
      ownerPassword: "propietario-456",
      allowCopy: false,
      allowModify: false,
      allowPrint: true,
    });

    const rejected = await PDF.load(protectedBytes, { credentials: "incorrecta" });
    expect(rejected.isAuthenticated).toBe(false);
    const opened = await PDF.load(protectedBytes, { credentials: "secreto-123" });
    expect(opened.getSecurity()).toMatchObject({
      isEncrypted: true,
      algorithm: "AES-256",
      hasUserPassword: true,
    });
  });
});
