"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function VirtualRows({ count, renderRow, label }: { count: number; renderRow: (index: number) => ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const frame = useRef<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(element); update();
    return () => { observer.disconnect(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, []);
  const start = Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(viewport.top / 36) - 6));
  const end = Math.min(count, Math.ceil((viewport.top + viewport.height) / 36) + 6);
  return <div ref={ref} aria-label={label} className="min-h-0 flex-1 overflow-auto" onScroll={() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; const element = ref.current; if (element) setViewport({ top: element.scrollTop, height: element.clientHeight }); });
  }} onDragOver={(event) => {
    event.preventDefault();
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    if (event.clientY < rect.top + 36) element.scrollTop -= 18;
    else if (event.clientY > rect.bottom - 36) element.scrollTop += 18;
  }}>
    <div style={{ height: count * 36, position: "relative" }}>
      {Array.from({ length: Math.max(0, end - start) }, (_, offset) => <div key={start + offset} style={{ position: "absolute", top: (start + offset) * 36, height: 36, width: "100%" }}>{renderRow(start + offset)}</div>)}
    </div>
  </div>;
}
