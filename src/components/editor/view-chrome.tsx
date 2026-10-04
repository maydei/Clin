"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Region = { element: HTMLDivElement; edge: 'top' | 'left' | 'right'; margin: number; hidden: boolean; visible: boolean; show: (value: boolean) => void };
const Regions = createContext<Map<symbol, Region> | null>(null);

/** One pointer owner resolves corners and keeps unrelated panels independent. */
export function ViewChrome({ children }: { children: ReactNode }) {
  const [regions] = useState(() => new Map<symbol, Region>());
  useEffect(() => {
    const timers = new Map<symbol, ReturnType<typeof setTimeout>>();
    let keyboard = false;
    let lastTarget: Node | null = null;
    const cancel = (id: symbol) => { clearTimeout(timers.get(id)); timers.delete(id); };
    const owns = (region: Region, target: Node | null) => {
      if (!target) return false;
      if (region.element.contains(target)) return true;
      return [...region.element.querySelectorAll('[aria-controls], [aria-owns]')].some(trigger =>
        `${trigger.getAttribute('aria-controls') ?? ''} ${trigger.getAttribute('aria-owns') ?? ''}`.split(/\s+/).some(id => id && document.getElementById(id)?.contains(target)));
    };
    const update = (event: PointerEvent) => {
      if (event.buttons && event.type === 'pointermove') return;
      keyboard = false;
      lastTarget = event.target as Node;
      const entries = [...regions.entries()];
      const header = entries.find(([, r]) => r.edge === 'top')?.[1];
      const shell = header?.element.closest('.editor-shell')?.getBoundingClientRect();
      const top = shell?.top ?? 0;
      const topEdge = event.clientY >= top && event.clientY <= top + (header?.margin ?? 24);
      const inTop = entries.some(([, r]) => r.edge === 'top' && r.visible && owns(r, lastTarget));
      for (const [id, region] of entries) {
        if (!region.hidden) continue;
        const atEdge = event.pointerType !== 'touch' && (region.edge === 'top' ? topEdge : !topEdge && !inTop &&
          (region.edge === 'left' ? event.clientX <= (shell?.left ?? 0) + region.margin : event.clientX >= (shell?.right ?? window.innerWidth) - region.margin));
        const inside = region.visible && (region.edge === 'top' ? inTop : owns(region, lastTarget));
        const editing = owns(region, document.activeElement) && document.activeElement?.matches('input, textarea, [contenteditable="true"]');
        const popup = [...region.element.querySelectorAll('[aria-expanded="true"][aria-controls]')].some(el => document.getElementById(el.getAttribute('aria-controls')!));
        if (atEdge || inside || (event.type !== 'pointerdown' && (editing || popup))) {
          cancel(id);
          if (atEdge || inside) region.show(true);
        } else if (region.visible && !timers.has(id)) {
          timers.set(id, setTimeout(() => {
            timers.delete(id);
            const current = regions.get(id);
            if (current && !(keyboard && owns(current, document.activeElement))) current.show(false);
          }, 300));
        }
      }
    };
    const key = () => { keyboard = true; for (const [id, region] of regions) if (owns(region, document.activeElement)) cancel(id); };
    const focus = () => { if (keyboard) for (const [id, region] of regions) if (owns(region, document.activeElement)) cancel(id); };
    window.addEventListener('pointermove', update);
    window.addEventListener('pointerdown', update);
    window.addEventListener('keydown', key);
    window.addEventListener('focusin', focus);
    return () => { for (const id of timers.keys()) cancel(id); window.removeEventListener('pointermove', update); window.removeEventListener('pointerdown', update); window.removeEventListener('keydown', key); window.removeEventListener('focusin', focus); };
  }, [regions]);
  return <Regions.Provider value={regions}>{children}</Regions.Provider>;
}

export function ViewRegion({ children, edge, hidden, margin, open, onOpenChange, className = '', style }: { children: ReactNode; edge: 'top' | 'left' | 'right'; hidden: boolean; margin: number; open?: boolean; onOpenChange?: (value: boolean) => void; className?: string; style?: React.CSSProperties }) {
  const root = useRef<HTMLDivElement>(null);
  const regions = useContext(Regions);
  const id = useRef(Symbol()).current;
  const [revealed, setRevealed] = useState(false);
  const visible = !hidden || (open ?? revealed);
  useEffect(() => {
    if (!root.current || !regions) return;
    regions.set(id, {element: root.current, edge, margin, hidden, visible, show: onOpenChange ?? setRevealed});
  }, [id, regions, edge, margin, hidden, visible, onOpenChange]);
  useEffect(() => () => { regions?.delete(id); }, [id, regions]);
  return <div ref={root} data-view-edge={edge} data-auto-hidden={hidden || undefined} data-revealed={hidden && visible || undefined} inert={!visible} className={className} style={style}>{children}</div>;
}

export function TouchChromeHandle({ visible }: { visible: boolean }) {
  const regions = useContext(Regions);
  if (!visible) return null;
  return <button type="button" className="touch-chrome-handle" aria-label="Mostrar controles" onClick={() => { for (const region of regions?.values() ?? []) if (region.edge === 'top') region.show(true); }}><span /></button>;
}

export function PanelResize({ side, width, onChange }: { side: 'left' | 'right'; width: number; onChange: (value: number) => void }) {
  const start = useRef<{x: number; width: number} | null>(null);
  const resize = (value: number) => onChange(Math.max(200, Math.min(Math.max(200, window.innerWidth * 0.42), value)));
  return <div role="separator" aria-label={side === 'left' ? 'Ancho del panel izquierdo' : 'Ancho del panel derecho'} aria-orientation="vertical" aria-valuenow={Math.round(width)} aria-valuemin={200} aria-valuemax={800} tabIndex={0} className={`panel-resize ${side === 'left' ? 'right-0' : 'left-0'}`}
    onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); resize(width + (e.key === 'ArrowRight' ? 16 : -16) * (side === 'left' ? 1 : -1)); } }}
    onPointerDown={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); start.current = {x:e.clientX, width}; }}
    onPointerMove={e => { if(start.current) resize(start.current.width + (e.clientX-start.current.x)*(side === 'left' ? 1 : -1)); }}
    onPointerUp={e => { start.current=null; if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={() => { start.current=null; }} />;
}
