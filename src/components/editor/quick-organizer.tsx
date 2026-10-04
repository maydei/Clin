"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  BookOpen,
  Check,
  ChevronRight,
  Columns3,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  List,
  ListTree,
  Plus,
  Rows3,
  X,
  FileText,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { pageIdsForSelection } from "@/lib/editor/model";
import type { CanvasGroup, EditorPage, EditorState } from "@/lib/editor/types";
import { PdfPageView } from "./pdf-page-view";
import { VisiblePage } from "./visible-page";

type PreviewMode = "single" | "book";

type QuickOrganizerProps = {
  state: EditorState;
  documents: Map<string, PDFDocumentProxy>;
  onSelectPages: (ids: string[]) => void;
  onReorder: (ids: string[]) => void;
  onRenamePage: (id: string, name: string) => void;
  onArrangeGrid: () => void;
  onArrangeDirection: (direction: "horizontal" | "vertical") => void;
  onCreateChapter: (name: string, parentId: string | null, pageIds: string[]) => void;
  onRenameChapter: (id: string, name: string) => void;
  onMovePagesToChapter: (pageIds: string[], groupId: string) => void;
};

const orderedPageIds = (pages: EditorPage[]) => [...pages].sort((a, b) => a.order - b.order).map((page) => page.id);

export function QuickOrganizer({
  state,
  documents,
  onSelectPages,
  onReorder,
  onRenamePage,
  onArrangeGrid,
  onArrangeDirection,
  onCreateChapter,
  onRenameChapter,
  onMovePagesToChapter,
}: QuickOrganizerProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("single");
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const [dropChapter, setDropChapter] = useState<string | null>(null);
  const [collapsedChapters, setCollapsedChapters] = useState(new Set<string>());
  const [announcement, setAnnouncement] = useState("");
  const pageRefs = useRef(new Map<string, HTMLElement>());
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [editingChapter, setEditingChapter] = useState<{ id: string; value: string } | null>(null);
  const [creatingChapter, setCreatingChapter] = useState<{ parentId: string | null; value: string } | null>(null);
  const selectionAnchor = useRef<string | null>(null);
  const orderedPages = useMemo(() => [...state.pages].sort((a, b) => a.order - b.order), [state.pages]);

  const dropBefore = (targetId: string, after = false) => {
    if (!draggedIds.length || draggedIds.includes(targetId)) return;
    const ids = orderedPageIds(orderedPages).filter((id) => !draggedIds.includes(id));
    const moving = orderedPageIds(orderedPages).filter((id) => draggedIds.includes(id));
    ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, ...moving);
    onReorder(ids);
    setDraggedIds([]);
    setDropTarget(null);
    setAnnouncement(`${moving.length} páginas reordenadas. El canvas y la salida siguen este orden.`);
  };

  const moveSelection = (direction: -1 | 1) => {
    const ids = orderedPageIds(orderedPages);
    const selected = new Set(state.selectedPageIds);
    const indices = direction === -1 ? ids.map((_, i) => i) : ids.map((_, i) => i).reverse();
    for (const index of indices) {
      const neighbor = index + direction;
      if (selected.has(ids[index]) && neighbor >= 0 && neighbor < ids.length && !selected.has(ids[neighbor])) [ids[index], ids[neighbor]] = [ids[neighbor], ids[index]];
    }
    onReorder(ids); setAnnouncement("Selección reordenada. Canvas actualizado.");
  };

  const renderTreePage = (page: EditorPage, depth: number) => (
    <Button key={page.id} variant="ghost" size="sm" aria-pressed={state.selectedPageIds.includes(page.id)}
      className={cn("w-full justify-start gap-2 rounded-none", state.selectedPageIds.includes(page.id) && "bg-accent text-accent-foreground")}
      style={{ paddingLeft: 14 + depth * 14 }} onClick={(event) => {
        onSelectPages(pageIdsForSelection(orderedPages, state.selectedPageIds, page.id, { range: event.shiftKey, toggle: event.ctrlKey || event.metaKey, anchorId: selectionAnchor.current }));
        if (!event.shiftKey) selectionAnchor.current = page.id;
        pageRefs.current.get(page.id)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }}><FileText data-icon="inline-start" /><span className="shrink-0 text-xs">{page.order + 1}</span><span className="truncate">{page.name}</span></Button>
  );

  const startCreatingChapter = (parentId: string | null) => {
    const siblingCount = state.groups.filter((group) => group.parentId === parentId).length;
    setCreatingChapter({ parentId, value: parentId ? `Subcapítulo ${siblingCount + 1}` : `Capítulo ${siblingCount + 1}` });
  };

  const commitChapter = () => {
    const name = creatingChapter?.value.trim();
    if (!creatingChapter || !name) return;
    onCreateChapter(name, creatingChapter.parentId, state.selectedPageIds);
    setCreatingChapter(null);
  };

  const renderChapter = (group: CanvasGroup, depth = 0): ReactNode => {
    const children = state.groups.filter((item) => item.parentId === group.id).sort((a, b) => a.order - b.order);
    const directPages = orderedPages.filter((page) => page.groupId === group.id);
    const editing = editingChapter?.id === group.id;
    return (
      <div key={group.id}>
        <div
          className={cn(
            "group flex min-h-9 items-center gap-1.5 border-l-2 pr-2 text-xs transition-colors",
            selectedChapterId === group.id || dropChapter === group.id ? "border-primary bg-accent" : "border-transparent hover:bg-muted",
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          onDragOver={(event) => { if (!draggedIds.length) return; event.preventDefault(); event.stopPropagation(); setDropChapter(group.id); setDropTarget(null); }}
          onDragLeave={() => setDropChapter(null)}
          onDrop={(event) => {
            event.preventDefault(); event.stopPropagation();
            if (draggedIds.length) onMovePagesToChapter(draggedIds, group.id);
            setDraggedIds([]); setDropChapter(null); setDropTarget(null);
          }}
        >
          <Button variant="ghost" size="icon-xs" aria-label={`${collapsedChapters.has(group.id) ? "Desplegar" : "Plegar"} ${group.name}`} aria-expanded={!collapsedChapters.has(group.id)} onClick={() => setCollapsedChapters((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}><ChevronRight className={cn(!collapsedChapters.has(group.id) && "rotate-90")} /></Button>
          <ListTree className="size-3.5 shrink-0" />
          {editing ? (
            <Input
              autoFocus
              aria-label="Nombre del capítulo"
              value={editingChapter.value}
              className="h-7 min-w-0 flex-1 px-1.5 text-xs"
              onChange={(event) => setEditingChapter({ id: group.id, value: event.target.value.slice(0, 80) })}
              onBlur={() => {
                if (editingChapter.value.trim()) onRenameChapter(group.id, editingChapter.value);
                setEditingChapter(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setEditingChapter(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => setSelectedChapterId(group.id)}
              onDoubleClick={() => setEditingChapter({ id: group.id, value: group.name })}
            >
              {group.name}
            </button>
          )}
          <span className="font-mono text-[9px] text-muted-foreground">{directPages.length}</span>
        </div>
        {!collapsedChapters.has(group.id) && <>{children.map((child) => renderChapter(child, depth + 1))}{directPages.map((page) => renderTreePage(page, depth + 1))}</>}
      </div>
    );
  };

  const renderPage = (page: EditorPage, index: number) => {
    const selected = state.selectedPageIds.includes(page.id);
    const maxWidth = previewMode === "book" ? 168 : 190;
    const maxHeight = previewMode === "book" ? 190 : 220;
    const scale = Math.min(maxWidth / page.width, maxHeight / page.height);
    const width = Math.max(36, page.width * scale);
    const height = Math.max(48, page.height * scale);
    return (
      <article
        key={page.id}
        ref={(element) => { if (element) pageRefs.current.set(page.id, element); else pageRefs.current.delete(page.id); }}
        data-testid="organizer-page"
        data-page-id={page.id}
        draggable
        data-selected={selected || undefined}
        className={cn(
          "group relative flex min-w-0 cursor-default flex-col border bg-background shadow-sm transition-[border-color,box-shadow,transform]",
          selected ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:border-foreground/35",
          previewMode === "book" && index === 0 && "col-start-2",
          draggedIds.includes(page.id) && "opacity-40",
        )}
        onDragStart={(event) => {
          const ids = selected ? state.selectedPageIds : [page.id];
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", ids.join(","));
          setDraggedIds(ids);
          if (!selected) onSelectPages(ids);
        }}
        onDragEnd={() => { setDraggedIds([]); setDropTarget(null); setDropChapter(null); }}
        onDragOver={(event) => {
          if (!draggedIds.length || draggedIds.includes(page.id)) return;
          event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
          const rect = event.currentTarget.getBoundingClientRect();
          const after = previewMode === "book" ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2;
          setDropTarget({ id: page.id, after }); setDropChapter(null);
          const viewport = event.currentTarget.closest('[data-slot="scroll-area-viewport"]');
          if (viewport) { const box = viewport.getBoundingClientRect(); if (event.clientY < box.top + 48) viewport.scrollTop -= 24; else if (event.clientY > box.bottom - 48) viewport.scrollTop += 24; }
        }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }}
        onDrop={(event) => { event.preventDefault(); event.stopPropagation(); dropBefore(page.id, dropTarget?.id === page.id && dropTarget.after); }}
        onClick={(event) => {
          const ids = pageIdsForSelection(orderedPages, state.selectedPageIds, page.id, {
            range: event.shiftKey,
            toggle: event.ctrlKey || event.metaKey,
            anchorId: selectionAnchor.current,
          });
          onSelectPages(ids);
          if (!event.shiftKey) selectionAnchor.current = page.id;
        }}
      >
        {dropTarget?.id === page.id && <div data-testid="organizer-drop-indicator" className={cn("pointer-events-none absolute bg-primary", previewMode === "book" ? "inset-y-0 w-1" : "inset-x-0 h-1", previewMode === "book" ? (dropTarget.after ? "-right-1.5" : "-left-1.5") : (dropTarget.after ? "-bottom-2.5" : "-top-2.5"))}><span className="absolute left-0 top-0 whitespace-nowrap rounded bg-primary px-2 py-1 text-xs text-primary-foreground">{dropTarget.after ? "Después" : "Antes"} · {draggedIds.length} pág.</span></div>}
        <div className="flex h-7 items-center gap-1.5 border-b border-border px-2">
          <GripVertical className="size-3 shrink-0 text-muted-foreground opacity-45 group-hover:opacity-100" />
          <span className="font-mono text-[10px] text-muted-foreground">{page.order + 1}</span>
          <span className="ml-auto max-w-24 truncate text-[9px] text-muted-foreground">
            {state.groups.find((group) => group.id === page.groupId)?.name}
          </span>
        </div>
        <div className="grid flex-1 place-items-center overflow-hidden bg-zinc-950/5 p-2 dark:bg-black/25" style={{ minHeight: maxHeight + 16 }}>
          <div className="relative" style={{ width, height }}><VisiblePage>{() => <PdfPageView
            document={documents.get(page.sourceId)}
            pageIndex={page.sourcePageIndex}
            width={width}
            height={height}
            zoom={Math.max(0.2, scale)}
            className="relative overflow-hidden bg-white shadow-sm"
          />}</VisiblePage></div>
        </div>
        <Input
          aria-label={`Nombre de ${page.name}`}
          defaultValue={page.name}
          key={`${page.id}-${page.name}`}
          className="h-8 rounded-none border-x-0 border-b-0 px-2 text-xs shadow-none focus-visible:ring-0"
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            const name = event.currentTarget.value.trim();
            if (name && name !== page.name) onRenamePage(page.id, name);
            else event.currentTarget.value = page.name;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = page.name;
              event.currentTarget.blur();
            }
          }}
        />
      </article>
    );
  };

  const rootGroups = state.groups.filter((group) => group.parentId === null).sort((a, b) => a.order - b.order);

  return (
    <div data-testid="quick-organizer" className="flex min-h-0 flex-1 flex-col">
      <p className="px-5 py-2 text-xs text-muted-foreground" role="status">{announcement || "Reordenar actualiza el canvas y el orden de salida. Puedes deshacerlo."}</p>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <Button size="icon-sm" variant="outline" aria-label="Mover selección antes" disabled={!state.selectedPageIds.length} onClick={() => moveSelection(-1)}><ArrowUp /></Button>
        <Button size="icon-sm" variant="outline" aria-label="Mover selección después" disabled={!state.selectedPageIds.length} onClick={() => moveSelection(1)}><ArrowDown /></Button>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onArrangeGrid}><LayoutGrid data-icon="inline-start" /> Cuadrícula</Button>
          <Button size="sm" variant="outline" disabled={state.pages.length < 2} onClick={() => onArrangeDirection("horizontal")}><Columns3 data-icon="inline-start" /> En fila</Button>
          <Button size="sm" variant="outline" disabled={state.pages.length < 2} onClick={() => onArrangeDirection("vertical")}><Rows3 data-icon="inline-start" /> En columna</Button>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5" aria-label="Vista de páginas">
          <ToggleGroup aria-label="Vista previa" value={[previewMode]} onValueChange={(values) => { if (values[0]) setPreviewMode(values[0] as PreviewMode); }} size="sm" variant="outline" spacing={0}>
            <ToggleGroupItem value="single"><List /> Una página</ToggleGroupItem><ToggleGroupItem value="book"><BookOpen /> Libro</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px]">
        <ScrollArea className="min-h-0 bg-muted/20">
          <div
            className={cn(
              "mx-auto grid min-h-full gap-4 p-5",
              previewMode === "single" ? "max-w-56 grid-cols-1" : "max-w-[520px] grid-cols-2 items-start gap-x-2 gap-y-5",
            )}
          >
            {orderedPages.map(renderPage)}
            {!orderedPages.length && <div className="col-span-full grid min-h-64 place-items-center text-xs text-muted-foreground">Sin páginas.</div>}
          </div>
        </ScrollArea>

        <aside className="flex min-h-0 flex-col border-l border-border bg-background">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
            <ListTree className="size-4" />
            <span className="text-xs font-medium">Árbol de páginas</span>
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">{state.groups.length}</span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="py-1">
              {rootGroups.map((group) => renderChapter(group))}
              {orderedPages.filter((page) => !page.groupId || !state.groups.some((group) => group.id === page.groupId)).map((page) => renderTreePage(page, 0))}
              {!orderedPages.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sin páginas.</p>}
            </div>
          </ScrollArea>
          {creatingChapter && (
            <div className="flex items-center gap-1 border-t border-border p-2">
              <Input
                autoFocus
                aria-label="Nombre del nuevo capítulo"
                value={creatingChapter.value}
                className="h-8 min-w-0 text-xs"
                onChange={(event) => setCreatingChapter({ ...creatingChapter, value: event.target.value.slice(0, 80) })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitChapter();
                  if (event.key === "Escape") setCreatingChapter(null);
                }}
              />
              <Button size="icon-sm" variant="ghost" aria-label="Crear capítulo" onClick={commitChapter}><Check data-icon="inline-start" /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Cancelar" onClick={() => setCreatingChapter(null)}><X data-icon="inline-start" /></Button>
            </div>
          )}
          <div className="grid shrink-0 grid-cols-2 gap-1 border-t border-border p-2">
            <Button size="sm" variant="outline" onClick={() => startCreatingChapter(null)}><FolderPlus data-icon="inline-start" /> Capítulo</Button>
            <Button size="sm" variant="outline" disabled={!selectedChapterId} onClick={() => startCreatingChapter(selectedChapterId)}><Plus data-icon="inline-start" /> Subcapítulo</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
