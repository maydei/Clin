"use client";

import { ViewRegion, PanelResize } from "./view-chrome";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Edit3, FilePlus2, Maximize, Minus, MoveHorizontal, Plus, RotateCw, Rows3, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton, InputGroupText } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VirtualRows } from "./virtual-rows";
import { AnnotationLayer } from "./annotation-layer";
import { ColorPicker } from "./color-picker";
import { VisiblePage } from "./visible-page";
import { PdfPageView } from "./pdf-page-view";
import { SearchHighlights } from "./search-highlights";
import { searchTextMatches } from "@/lib/editor/text-index";
import type { Annotation, DocumentTextBlock, EditorPage, EditorState, ReplacementAnnotation } from "@/lib/editor/types";

type ReaderViewProps = {
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  interfaceHidden?: boolean;
  revealMargin?: number;
  panelWidth?: number;
  onPanelWidthChange?: (width: number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activePageId?: string | null;
  onActivePageChange?: (id: string) => void;
  state: EditorState;
  documents: Map<string, PDFDocumentProxy>;
  onImport: () => void;
  onOpenCanvas: () => void;
  onSelectAnnotation: (id: string | null) => void;
  onCreateReplacement: (block: DocumentTextBlock) => void;
  onUpdateAnnotation: (id: string, patch: Partial<Annotation>) => void;
};

export function ReaderView({ panelOpen = false, onPanelOpenChange, interfaceHidden = false, revealMargin = 24, panelWidth = 224, onPanelWidthChange = () => undefined, searchQuery, onSearchChange, activePageId, onActivePageChange, state, documents, onImport, onOpenCanvas, onSelectAnnotation, onCreateReplacement, onUpdateAnnotation }: ReaderViewProps) {
  const [zoom, setZoom] = useState(1);
  const [availableWidth, setAvailableWidth] = useState(900);
  const [availableHeight, setAvailableHeight] = useState(700);
  const [fitMode, setFitMode] = useState<"width" | "page">("width");
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [searchIndex, setSearchIndex] = useState(0);
  const [viewRotation, setViewRotation] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const initialPage = useRef(activePageId);
  const scrollFrame = useRef<number | null>(null);
  const pageRefs = useRef(new Map<string, HTMLDivElement>());
  const ordered = useMemo(() => [...state.pages].sort((a, b) => a.order - b.order), [state.pages]);
  const searchResults = useMemo(() => searchTextMatches(state.textBlocks, searchQuery), [searchQuery, state.textBlocks]);
  const activeSearchBlock = searchResults[searchIndex] ?? null;
  const selected = state.annotations.find((annotation): annotation is ReplacementAnnotation => annotation.id === state.selectedAnnotationId && annotation.type === "replacement");

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const update = () => {
      setAvailableWidth(element.clientWidth);
      setAvailableHeight(element.clientHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest('[role="dialog"], [role="alertdialog"]') || document.querySelector('[data-testid="presentation-view"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (initialPage.current) pageRefs.current.get(initialPage.current)?.scrollIntoView({ block: "start" });
    return () => { if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current); };
  }, []);

  const annotationsByPage = useMemo(() => {
    const result = new Map<string, Annotation[]>();
    for (const annotation of state.annotations) if (annotation.pageId) {
      const list = result.get(annotation.pageId) ?? []; list.push(annotation); result.set(annotation.pageId, list);
    }
    return result;
  }, [state.annotations]);
  const textByPage = useMemo(() => {
    const result = new Map<string, DocumentTextBlock[]>();
    for (const block of state.textBlocks) { const list = result.get(block.pageId) ?? []; list.push(block); result.set(block.pageId, list); }
    return result;
  }, [state.textBlocks]);

  const focusPage = (page: EditorPage) => {
    const index = ordered.findIndex((candidate) => candidate.id === page.id);
    if (index >= 0) { setCurrentPageIndex(index); onActivePageChange?.(page.id); }
    pageRefs.current.get(page.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const goToPage = (index: number) => {
    const bounded = Math.max(0, Math.min(ordered.length - 1, index));
    const page = ordered[bounded];
    if (page) focusPage(page);
  };
  const focusSearchResult = (index: number, results = searchResults) => {
    if (!results.length) return;
    const bounded = ((index % results.length) + results.length) % results.length;
    setSearchIndex(bounded);
    const page = ordered.find((candidate) => candidate.id === results[bounded].pageId);
    if (page) focusPage(page);
  };
  const updateSearch = (query: string) => {
    onSearchChange(query);
    const results = searchTextMatches(state.textBlocks, query);
    setSearchIndex(0);
    if (results[0]) {
      const page = ordered.find((candidate) => candidate.id === results[0].pageId);
      if (page) focusPage(page);
    }
  };
  const updateCurrentPageFromScroll = () => {
    const container = contentRef.current;
    if (!container || !ordered.length) return;
    const top = container.getBoundingClientRect().top + 24;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    ordered.forEach((page, index) => {
      const element = pageRefs.current.get(page.id);
      if (!element) return;
      const distance = Math.abs(element.getBoundingClientRect().top - top);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setCurrentPageIndex(closestIndex);
    if (ordered[closestIndex]) onActivePageChange?.(ordered[closestIndex].id);
  };

  return (
    <main data-testid="reader-view" className="relative flex min-h-0 flex-1 bg-canvas">
      <ViewRegion edge="left" hidden open={panelOpen} onOpenChange={onPanelOpenChange} margin={revealMargin} style={{width:panelWidth}} className="absolute inset-y-0 left-0 z-40 max-w-[42vw] border-r border-border bg-panel"><aside className="flex h-full flex-col">
        <div className="flex h-11 items-center gap-2 border-b border-border px-3 text-xs font-semibold"><Rows3 className="size-4" /> Páginas <span className="ml-auto font-mono text-[10px] text-muted-foreground">{ordered.length}</span></div>
        <VirtualRows count={ordered.length} label="Páginas del lector" renderRow={(index) => { const page = ordered[index]; return <button key={page.id} type="button" className={`flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-muted ${currentPageIndex === index ? "bg-primary/10 text-foreground" : ""}`} onClick={() => focusPage(page)}><span className="grid size-5 place-items-center bg-foreground/8 font-mono text-[9px]">{page.order + 1}</span><span className="truncate">{page.name}</span></button>; }} />
      </aside><PanelResize side="left" width={panelWidth} onChange={onPanelWidthChange} /></ViewRegion>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <ViewRegion key={String(interfaceHidden)} edge="top" hidden={interfaceHidden} margin={revealMargin} style={interfaceHidden ? {top:"3.25rem"} : undefined} className="bg-background"><div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background px-2">
          <Button variant="ghost" size="icon-sm" aria-label="Página anterior" disabled={currentPageIndex === 0} onClick={() => goToPage(currentPageIndex - 1)}><ChevronLeft data-icon="inline-start" /></Button>
          <Input key={currentPageIndex} type="number" min={1} max={ordered.length} defaultValue={currentPageIndex + 1} aria-label="Página actual" className="h-8 w-12 px-1 text-center font-mono text-xs" onKeyDown={(event) => { if (event.key === "Enter") goToPage(Number(event.currentTarget.value) - 1); }} />
          <span data-testid="reader-current-page" className="mr-2 whitespace-nowrap font-mono text-[11px] text-muted-foreground">/ {ordered.length}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Página siguiente" disabled={currentPageIndex >= ordered.length - 1} onClick={() => goToPage(currentPageIndex + 1)}><ChevronRight data-icon="inline-start" /></Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" size="icon-sm" aria-label="Alejar" onClick={() => setZoom((value) => Math.max(0.25, value - 0.1))}><Minus data-icon="inline-start" /></Button>
          <span className="w-12 text-center font-mono text-[11px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon-sm" aria-label="Acercar" onClick={() => setZoom((value) => Math.min(3, value + 0.1))}><Plus data-icon="inline-start" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Ajustar ancho" aria-pressed={fitMode === "width"} onClick={() => { setFitMode("width"); setZoom(1); }}><MoveHorizontal data-icon="inline-start" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Ajustar página" aria-pressed={fitMode === "page"} onClick={() => { setFitMode("page"); setZoom(1); }}><Maximize data-icon="inline-start" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Girar vista" onClick={() => setViewRotation((value) => (value + 90) % 360)}><RotateCw data-icon="inline-start" /></Button>
          <Button variant="outline" size="sm" className="ml-auto" onClick={onOpenCanvas}><Edit3 data-icon="inline-start" /> Editar en Canvas</Button>
        </div>
        <div className="shrink-0 px-2 py-2"><InputGroup>
          <InputGroupInput ref={searchInputRef} type="search" role="searchbox" aria-label="Buscar en el PDF" placeholder="Buscar palabras…" value={searchQuery} onChange={(event) => updateSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") focusSearchResult(searchIndex + (event.shiftKey ? -1 : 1)); }} />
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupAddon align="inline-end">
            <InputGroupText data-testid="reader-search-count">{searchResults.length ? `${searchIndex + 1} / ${searchResults.length}` : "0 / 0"}</InputGroupText>
            <InputGroupButton size="icon-xs" aria-label="Resultado anterior" disabled={!searchResults.length} onClick={() => focusSearchResult(searchIndex - 1)}><ChevronLeft /></InputGroupButton>
            <InputGroupButton size="icon-xs" aria-label="Resultado siguiente" disabled={!searchResults.length} onClick={() => focusSearchResult(searchIndex + 1)}><ChevronRight /></InputGroupButton>
            <InputGroupButton size="icon-xs" aria-label="Limpiar búsqueda" disabled={!searchQuery} onClick={() => { onSearchChange(""); setSearchIndex(0); searchInputRef.current?.focus(); }}><X /></InputGroupButton>
          </InputGroupAddon>
        </InputGroup></div></ViewRegion>
        <div ref={contentRef} className="min-h-0 flex-1 overflow-auto overscroll-contain py-7" onScroll={() => { if (scrollFrame.current !== null) return; scrollFrame.current = requestAnimationFrame(() => { scrollFrame.current = null; updateCurrentPageFromScroll(); }); }}>
          {!ordered.length && <button type="button" className="mx-auto mt-24 flex h-32 w-[min(360px,100%)] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-background text-xs text-muted-foreground" onClick={onImport}><FilePlus2 className="size-5" /> Abrir PDF</button>}
          <div className="mx-auto flex w-fit flex-col gap-6">
            {ordered.map((page) => {
              const rotation = (page.rotation + viewRotation) % 360;
              const quarterTurn = rotation % 180 !== 0;
              const displayWidth = quarterTurn ? page.height : page.width;
              const displayHeight = quarterTurn ? page.width : page.height;
              const fitWidth = Math.max(0.05, (availableWidth - 2) / displayWidth);
              const fitPage = Math.min(fitWidth, Math.max(0.05, (availableHeight - 56) / displayHeight));
              const fit = fitMode === "page" ? fitPage : fitWidth;
              const scale = fit * zoom;
              const blocks = textByPage.get(page.id) ?? [];
              return (
                <div key={page.id} ref={(element) => { if (element) pageRefs.current.set(page.id, element); else pageRefs.current.delete(page.id); }} className="scroll-mt-14">
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] text-muted-foreground"><span className="font-mono">{page.order + 1}</span><span>{page.name}</span></div>
                  <div className="relative bg-white shadow-[0_12px_40px_rgba(0,0,0,0.14)]" style={{ width: displayWidth * scale, height: displayHeight * scale }}>
                    <div className="absolute left-1/2 top-1/2 origin-center" style={{ width: page.width, height: page.height, marginLeft: -page.width / 2, marginTop: -page.height / 2, transform: `rotate(${rotation}deg) scale(${scale})` }}>
                      <VisiblePage>{() => <div className="absolute inset-0 overflow-hidden"><div style={{ width: page.sourceWidth ?? page.width, height: page.sourceHeight ?? page.height, transform: `translate(${- (page.crop?.x ?? 0)}px, ${- (page.crop?.y ?? 0)}px)` }}>
                      <PdfPageView document={documents.get(page.sourceId)} pageIndex={page.sourcePageIndex} width={page.sourceWidth ?? page.width} height={page.sourceHeight ?? page.height} zoom={scale} className="absolute inset-0 overflow-hidden" />
                      <AnnotationLayer pageId={page.id} width={page.sourceWidth ?? page.width} height={page.sourceHeight ?? page.height} annotations={annotationsByPage.get(page.id) ?? []} draft={null} selectedAnnotationId={state.selectedAnnotationId} selectedAnnotationIds={state.selectedAnnotationIds} interactive={false} erasing={false} onSelect={onSelectAnnotation} onErase={() => undefined} onMove={() => undefined} />
                      {blocks.map((block) => (
                        <button
                          key={block.id}
                          data-testid="reader-text-block"
                          type="button"
                          aria-label={`Editar texto: ${block.text}`}
                          className="absolute z-10 border border-transparent bg-transparent text-transparent outline-none hover:border-primary hover:bg-primary/8 focus:border-primary"
                          style={{ left: block.x, top: block.y, width: Math.max(8, block.width), height: Math.max(8, block.height) }}
                          onDoubleClick={() => {
                            const replacement = state.annotations.find((annotation) => annotation.type === "replacement" && annotation.sourceTextBlockId === block.id);
                            if (replacement) onSelectAnnotation(replacement.id);
                            else onCreateReplacement(block);
                          }}
                        >{block.text}</button>
                      ))}
                      <SearchHighlights matches={searchResults.filter((match) => match.pageId === page.id)} activeId={activeSearchBlock?.id} testId="reader-search-target" />
                      </div></div>}</VisiblePage>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {selected && (
        <aside className="w-72 shrink-0 border-l border-border bg-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Editar texto</h2>
            <Button variant="ghost" size="icon-sm" aria-label="Cerrar editor de texto" onClick={() => onSelectAnnotation(null)}><X data-icon="inline-start" /></Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">El cambio se conserva de forma no destructiva.</p>
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2"><Label htmlFor="reader-text">Texto</Label><textarea id="reader-text" aria-label="Texto del PDF" value={selected.text} onChange={(event) => onUpdateAnnotation(selected.id, { text: event.target.value })} className="min-h-28 w-full resize-y rounded-md border border-input bg-background p-2 text-sm outline-none focus:border-ring" /></div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2"><div className="flex flex-col gap-2"><Label htmlFor="reader-font-size">Tamaño</Label><Input id="reader-font-size" type="number" min={4} max={120} value={selected.fontSize} onChange={(event) => onUpdateAnnotation(selected.id, { fontSize: Number(event.target.value) })} /></div><div className="flex flex-col gap-2"><Label>Color</Label><ColorPicker label="Color del texto" value={selected.color} onChange={(color) => onUpdateAnnotation(selected.id, { color })} side="left" className="border border-border" /></div></div>
            <p className="text-[11px] text-muted-foreground">El cuadro mantiene el tamaño original; ajusta el texto o el tamaño si se desborda.</p>
          </div>
        </aside>
      )}
    </main>
  );
}
