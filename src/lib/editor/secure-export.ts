export type PdfProtectionOptions = {
  userPassword: string;
  ownerPassword?: string;
  allowPrint: boolean;
  allowCopy: boolean;
  allowModify: boolean;
};

export type PdfSignatureOptions = {
  certificate: Uint8Array;
  certificatePassword: string;
  reason?: string;
  location?: string;
  documentPassword?: string;
};

export async function protectPdf(bytes: Uint8Array, options: PdfProtectionOptions) {
  const { PDF } = await import("@libpdf/core");
  const pdf = await PDF.load(bytes);
  pdf.setProtection({
    userPassword: options.userPassword,
    ownerPassword: options.ownerPassword,
    algorithm: "AES-256",
    permissions: {
      print: options.allowPrint,
      printHighQuality: options.allowPrint,
      copy: options.allowCopy,
      modify: options.allowModify,
      annotate: options.allowModify,
      fillForms: options.allowModify,
      assemble: options.allowModify,
      accessibility: true,
    },
  });
  return pdf.save();
}

export async function signPdf(bytes: Uint8Array, options: PdfSignatureOptions) {
  const { PDF, P12Signer } = await import("@libpdf/core");
  const pdf = await PDF.load(bytes, options.documentPassword
    ? { credentials: options.documentPassword }
    : undefined);
  const signer = await P12Signer.create(options.certificate, options.certificatePassword);
  const result = await pdf.sign({
    signer,
    reason: options.reason?.trim() || undefined,
    location: options.location?.trim() || undefined,
    level: "B-B",
  });
  return result.bytes;
}
