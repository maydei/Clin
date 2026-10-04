"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, MonitorOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { AnnotationLayer } from "./annotation-layer";
import { PdfPageView } from "./pdf-page-view";
import { sourcePageFrame } from "@/lib/editor/crop";
import { boardAnnotationsForPage } from "@/lib/editor/board-projection";
import { renderPage } from "@/lib/editor/render-scheduler";
import { presentationPreloadIndices } from "@/lib/editor/presentation-cache";
import type { Annotation, EditorPage } from "@/lib/editor/types";

const transitions = [{ value: "fade", label: "Fundido" }, { value: "slide", label: "Deslizar horizontal" }, { value: "slide-vertical", label: "Deslizar vertical" }, { value: "none", label: "Ninguna" }];

export type PresentationTransition = "fade" | "slide" | "slide-vertical" | "none";

type PresentationViewProps = {
  open: boolean;
  pages: EditorPage[];
  documents: Map<string, PDFDocumentProxy>;
  annotations: Annotation[];
  transition: PresentationTransition;
  onTransitionChange: (transition: PresentationTransition) => void;
  onClose: () => void;
};

type SlideProps = {
  page: EditorPage;
  index: number;
  viewport: { width: number; height: number };
  document: PDFDocumentProxy | undefined;
  annotations: Annotation[];
  transition: PresentationTransition;
  phase: "stable" | "incoming" | "outgoing";
  direction: "forward" | "backward";
};

function PresentationSlide({ page, index, viewport, document, annotations, transition, phase, direction }: SlideProps) {
  const quarterTurn = page.rotation % 180 !== 0;
  const rotatedWidth = quarterTurn ? page.height : page.width;
  const rotatedHeight = quarterTurn ? page.width : page.height;
  const scale = Math.min(
    Math.max(0.05, (viewport.width * 0.9) / Math.max(1, rotatedWidth)),
    Math.max(0.05, (viewport.height * 0.9) / Math.max(1, rotatedHeight)),
    2.5,
  );
  return (
    <div data-testid="presentation-slide" data-transition={transition} data-phase={phase} data-direction={direction} className="presentation-slide absolute inset-0 grid place-items-center">
      <div data-testid="presentation-page-frame" className="relative" style={{ width: rotatedWidth * scale, height: rotatedHeight * scale }}>
        <div className="absolute left-1/2 top-1/2 origin-center bg-white shadow-2xl" style={{ width: page.width, height: page.height, marginLeft: -page.width / 2, marginTop: -page.height / 2, transform: `rotate(${page.rotation}deg) scale(${scale})` }}>
          <div className="relative h-full w-full overflow-hidden"><div style={{ position: "absolute", left: -(page.crop?.x ?? 0), top: -(page.crop?.y ?? 0), width: page.sourceWidth ?? page.width, height: page.sourceHeight ?? page.height }}>
          <PdfPageView document={document} pageIndex={page.sourcePageIndex} width={page.sourceWidth ?? page.width} height={page.sourceHeight ?? page.height} zoom={scale} className="absolute inset-0 overflow-hidden" />
          <AnnotationLayer pageId={page.id} width={page.sourceWidth ?? page.width} height={page.sourceHeight ?? page.height} annotations={annotations} draft={null} selectedAnnotationId={null} interactive={false} erasing={false} onSelect={() => undefined} onErase={() => undefined} onMove={() => undefined} />
          </div></div>
        </div>
        <span className="sr-only">Página {index + 1}</span>
      </div>
    </div>
  );
}

export function PresentationView({ open, pages, documents, annotations, transition, onTransitionChange, onClose }: PresentationViewProps) {
  const [index, setIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [viewport, setViewport] = useState({ width: 1280, height: 720 });
  const [showBoard, setShowBoard] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [transitionMenuOpen, setTransitionMenuOpen] = useState(false);
  const transitionMenuRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const transitionTimer = useRef<number | null>(null);
  const controlsTimer = useRef<number | null>(null);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current);
    controlsTimer.current = window.setTimeout(() => { if (!transitionMenuRef.current && !sectionRef.current?.contains(document.activeElement)) setControlsVisible(false); }, 1500);
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!open || !element) return;
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !pages.length) return;
    const controller = new AbortController();
    presentationPreloadIndices(index, pages.length).filter((candidate) => candidate !== index).sort((a, b) => Math.abs(a-index) - Math.abs(b-index)).forEach((candidateIndex) => {
      const page = pages[candidateIndex];
      const document = documents.get(page.sourceId);
      if (document) void renderPage(document, page.sourcePageIndex, 0.25, controller.signal, -1).catch(() => undefined);
    });
    return () => controller.abort();
  }, [documents, index, open, pages]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(revealControls);
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === sectionRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [open, revealControls]);

  const navigate = useCallback((nextIndex: number) => {
    const bounded = Math.max(0, Math.min(pages.length - 1, nextIndex));
    if (bounded === index || outgoingIndex !== null) return;
    if (transition === "none") {
      setIndex(bounded);
      return;
    }
    setDirection(bounded > index ? "forward" : "backward");
    setOutgoingIndex(index);
    setIndex(bounded);
    transitionTimer.current = window.setTimeout(() => {
      setOutgoingIndex(null);
      transitionTimer.current = null;
    }, 320);
  }, [index, outgoingIndex, pages.length, transition]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (transitionMenuRef.current || (event.key !== "Escape" && (event.target as HTMLElement)?.closest("button, input, [role=combobox], [role=listbox]"))) return;
      if (["ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); navigate(index + 1); }
      else if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); navigate(index - 1); }
      else if (event.key === "Home") navigate(0);
      else if (event.key === "End") navigate(pages.length - 1);
      else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setIndex(0);
        setOutgoingIndex(null);
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [index, navigate, onClose, open, pages.length]);

  if (!open || pages.length === 0) return null;
  const currentPage = pages[Math.min(index, pages.length - 1)];
  const pageAnnotations = (page: EditorPage) => [
    ...annotations,
    ...(showBoard ? boardAnnotationsForPage(annotations, sourcePageFrame(page)) : []),
  ];
  const closePresentation = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    setIndex(0);
    setOutgoingIndex(null);
    onClose();
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void sectionRef.current?.requestFullscreen?.();
  };

  return (
    <section ref={sectionRef} data-testid="presentation-view" className="presentation-surface fixed inset-0 z-[100] flex flex-col bg-background text-foreground" aria-label="Presentación" onPointerMove={revealControls}>
      <div ref={viewportRef} data-testid="presentation-viewport" className="relative min-h-0 flex-1 overflow-hidden">
        {outgoingIndex !== null && <PresentationSlide page={pages[outgoingIndex]} index={outgoingIndex} viewport={viewport} document={documents.get(pages[outgoingIndex].sourceId)} annotations={pageAnnotations(pages[outgoingIndex])} transition={transition} phase="outgoing" direction={direction} />}
        <PresentationSlide page={currentPage} index={index} viewport={viewport} document={documents.get(currentPage.sourceId)} annotations={pageAnnotations(currentPage)} transition={transition} phase={outgoingIndex === null ? "stable" : "incoming"} direction={direction} />
      </div>
      <div
        data-testid="presentation-controls"
        data-visible={controlsVisible ? "true" : "false"}
        className={cn("absolute inset-x-0 bottom-0 z-20 flex min-h-14 flex-wrap items-center justify-center gap-2 bg-background px-3 py-2 transition-opacity duration-200", controlsVisible ? "opacity-100" : "pointer-events-none opacity-0")}
        onPointerEnter={revealControls}
      >
        <Button variant="ghost" size="icon-sm" aria-label="Página anterior" disabled={index === 0 || outgoingIndex !== null} onClick={() => navigate(index - 1)}><ChevronLeft data-icon="inline-start" /></Button>
        <span className="w-16 text-center font-mono text-xs text-muted-foreground">{index + 1} / {pages.length}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Página siguiente" disabled={index === pages.length - 1 || outgoingIndex !== null} onClick={() => navigate(index + 1)}><ChevronRight data-icon="inline-start" /></Button>
        <Separator orientation="vertical" className="mx-2 h-5" />
        <Select items={transitions} value={transition} open={transitionMenuOpen} onOpenChange={(value) => { transitionMenuRef.current = value; setTransitionMenuOpen(value); revealControls(); }} onValueChange={(value) => { if (value) onTransitionChange(value as PresentationTransition); }}>
          <SelectTrigger size="sm" aria-label="Transición" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent portalContainer={sectionRef} side="top" alignItemWithTrigger={false}><SelectGroup>{transitions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        <Label className="ml-1 flex items-center gap-2"><Switch aria-label="Mostrar pizarra" checked={showBoard} onCheckedChange={setShowBoard} /> Pizarra</Label>
        <Button variant="ghost" size="icon-sm" aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onClick={toggleFullscreen}>{fullscreen ? <Minimize2 /> : <Maximize2 />}</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Salir de presentación" onClick={closePresentation}><MonitorOff data-icon="inline-start" /></Button>
      </div>
    </section>
  );
}
