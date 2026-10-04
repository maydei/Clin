"use client";
import { useState } from "react";
import { clientToWorld, type Bounds } from "@/lib/editor/geometry";
import type { Camera } from "@/lib/editor/types";
export function CaptureOverlay({ camera, onCapture, onCancel }: { camera: Camera; onCapture: (region: Bounds) => void; onCancel: () => void }) {
  const [rect, setRect] = useState<{ x: number; y: number; endX: number; endY: number } | null>(null);
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(box.width, event.clientX - box.left)), y: Math.max(0, Math.min(box.height, event.clientY - box.top)) };
  };
  return <div className="absolute inset-0 z-50 cursor-crosshair touch-none" onPointerDown={(event) => { event.stopPropagation(); if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); setRect({ ...p, endX: p.x, endY: p.y }); }} onPointerMove={(event) => { event.stopPropagation(); if (!rect) return; const p = point(event); setRect({ ...rect, endX: p.x, endY: p.y }); }} onPointerCancel={() => setRect(null)} onPointerUp={(event) => {
    event.stopPropagation(); if (!rect) return; const p = point(event);
    const width = Math.abs(p.x - rect.x), height = Math.abs(p.y - rect.y);
    setRect(null); if (width < 4 || height < 4) return;
    const origin = clientToWorld({ x: Math.min(rect.x, p.x), y: Math.min(rect.y, p.y) }, camera);
    onCapture({ ...origin, width: width / camera.zoom, height: height / camera.zoom });
  }}>
    <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-md border bg-background p-3 text-sm shadow" onPointerDown={(event) => event.stopPropagation()}><span>Arrastra una región para guardarla como PNG</span><button type="button" className="rounded border px-2 py-1" onClick={onCancel}>Cancelar · Esc</button></div>
    {rect && <div className="pointer-events-none absolute border-2 border-primary bg-primary/10" style={{ left: Math.min(rect.x, rect.endX), top: Math.min(rect.y, rect.endY), width: Math.abs(rect.endX - rect.x), height: Math.abs(rect.endY - rect.y), boxShadow: "0 0 0 10000px rgb(0 0 0 / 20%)" }} />}
  </div>;
}
