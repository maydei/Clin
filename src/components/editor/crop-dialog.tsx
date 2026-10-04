"use client";
import { useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { EditorPage } from "@/lib/editor/types";
import type { CropRect } from "@/lib/editor/crop";
import { PdfPageView } from "./pdf-page-view";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function CropDialog({ page, document, onClose, onApply }: { page: EditorPage; document?: PDFDocumentProxy; onClose: () => void; onApply: (crop: CropRect | null) => void }) {
  const width = page.sourceWidth ?? page.width, height = page.sourceHeight ?? page.height;
  const [crop, setCrop] = useState<CropRect>(page.crop ?? { x: 0, y: 0, width, height });
  const scale = Math.min(360 / width, 300 / height);
  const valid = Object.values(crop).every(Number.isFinite) && crop.x >= 0 && crop.y >= 0 && crop.width >= 1 && crop.height >= 1 && crop.x + crop.width <= width && crop.y + crop.height <= height;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>Recortar página</DialogTitle><DialogDescription>El original se conserva. Puedes deshacer el recorte o recuperar toda la página. Al exportar un PDF con recortes, la salida se convierte en imágenes.</DialogDescription></DialogHeader>
    <div className="relative mx-auto overflow-hidden bg-muted" style={{ width: width * scale, height: height * scale }}><div className="absolute origin-top-left" style={{ width, height, transform: `scale(${scale})` }}><PdfPageView document={document} pageIndex={page.sourcePageIndex} width={width} height={height} zoom={scale} /><div className="pointer-events-none absolute border-2 border-primary" style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height, boxShadow: "0 0 0 10000px rgb(0 0 0 / 45%)" }} /></div></div>
    <div className="grid grid-cols-2 gap-3">{([['x', 'Desde la izquierda'], ['y', 'Desde arriba'], ['width', 'Ancho'], ['height', 'Alto']] as const).map(([key, label]) => <label key={key} className="text-xs">{label} (pt)<Input type="number" min={key === "width" || key === "height" ? 1 : 0} value={crop[key]} onChange={(event) => setCrop({ ...crop, [key]: Number(event.target.value) })} /></label>)}</div>
    {!valid && <p role="alert" className="text-xs text-destructive">El recorte debe quedar dentro de la página.</p>}
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="outline" onClick={() => onApply(null)}>Página completa</Button><Button disabled={!valid} onClick={() => onApply(crop)}>Aplicar recorte</Button></DialogFooter>
  </DialogContent></Dialog>;
}
