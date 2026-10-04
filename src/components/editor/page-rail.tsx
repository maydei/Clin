"use client";
import { PlayingCardsFan } from "./playing-cards-fan";

import { VirtualRows } from "./virtual-rows";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Paperclip,
  Highlighter,
  ListTree,
  Layers2,
  LayoutGrid,
  PenLine,
  PencilLine,
  Search,
  Square,
  Type,

  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToolButton } from "./tool-button";
import type {
  Annotation,
  CanvasGroup,
  DocumentOutlineItem,
  DocumentSource,
  EditorPage,
  EditorState,
  DocumentTextBlock,
} from "@/lib/editor/types";
import { searchTextMatches } from "@/lib/editor/text-index";
import { explicitSelection, selectionKey, type SelectionItem } from "@/lib/editor/selection";

type PageRailProps = {
  tab: string;
  onTabChange: (tab: string) => void;
  searchFocusRequest: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectItem: (item: SelectionItem, rows: SelectionItem[], anchor: SelectionItem | null, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  state: EditorState;
  sources: DocumentSource[];
  onSelectPages: (ids: string[]) => void;
  onSelectGroup: (id: string | null) => void;
  onSelectAnnotation: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onFocusPage: (page: EditorPage) => void;
  onFocusTextBlock: (block: DocumentTextBlock) => void;
  onCreateGroup: (name: string, parentId: string | null) => void;
  onRenameGroup: (id: string, name: string) => void;
  onRenamePage: (id: string, name: string) => void;
  onMoveToGroup: (pageIds: string[], groupId: string | null) => void;
  onToggleGroup: (id: string) => void;
  onUngroup: (pageIds: string[]) => void;
  onDeleteGroup: (id: string) => void;
  onCreateReplacement: (block: DocumentTextBlock) => void;
};

const annotationIcon = (annotation: Annotation) => {
  if (annotation.type === "ink") return <PenLine />;
  if (annotation.type === "highlight") return <Highlighter />;
  if (annotation.type === "text") return <Type />;
  if (annotation.type === "replacement") return <PencilLine />;
  return <Square />;
};

export function PageRail({
  tab, onTabChange: setTab, searchFocusRequest,
  searchQuery,
  onSearchChange,
  state,
  onSelectItem,
  sources,
  onReorder,
  onFocusPage,
  onFocusTextBlock,
  onCreateGroup,
  onRenameGroup,
  onRenamePage,
  onMoveToGroup,
  onUngroup,
  onToggleGroup,
  onDeleteGroup,
  onCreateReplacement,
}: PageRailProps) {
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const selectionAnchor = useRef<SelectionItem | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchFocusRequest && tab === "search") { searchInputRef.current?.focus(); searchInputRef.current?.select(); }
  }, [searchFocusRequest, tab]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<{ type: "group" | "page"; id: string; value: string } | null>(null);
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [newGroupName, setNewGroupName] = useState("Grupo");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const ordered = useMemo(() => [...state.pages].sort((a, b) => a.order - b.order), [state.pages]);
  const searchResults = useMemo(() => searchTextMatches(state.textBlocks, searchQuery), [searchQuery, state.textBlocks]);

  const pagesByGroup = useMemo(() => {
    const map = new Map<string | null, EditorPage[]>();
    for (const page of ordered) { const list = map.get(page.groupId) ?? []; list.push(page); map.set(page.groupId, list); }
    return map;
  }, [ordered]);
  const childrenByGroup = useMemo(() => {
    const map = new Map<string | null, CanvasGroup[]>();
    for (const group of [...state.groups].sort((a, b) => a.order - b.order)) { const list = map.get(group.parentId) ?? []; list.push(group); map.set(group.parentId, list); }
    return map;
  }, [state.groups]);
  const rows = useMemo(() => {
    const result: Array<{ group?: CanvasGroup; page?: EditorPage; annotation?: Annotation; depth: number }> = [];
    const visited = new Set<string>();
    const annotationGroups = new Map<string | null, Annotation[]>();
    const pageAnnotations = new Map<string, Annotation[]>();
    for (const annotation of state.annotations) {
      if (annotation.groupId || annotation.pageId === null) {
        const parent = annotation.groupId ?? null;
        const list = annotationGroups.get(parent) ?? []; list.push(annotation); annotationGroups.set(parent, list);
      } else { const list = pageAnnotations.get(annotation.pageId) ?? []; list.push(annotation); pageAnnotations.set(annotation.pageId, list); }
    }
    const visit = (parent: string | null, depth: number) => {
      const entries: Array<{ group?: CanvasGroup; page?: EditorPage; order: number }> = [
        ...(childrenByGroup.get(parent) ?? []).map((group) => ({ group, order: group.order })),
        ...(pagesByGroup.get(parent) ?? []).map((page) => ({ page, order: page.order })),
      ];
      entries.sort((a, b) => a.order - b.order);
      for (const entry of entries) {
        if (entry.group) {
          const group = entry.group;
          if (visited.has(group.id)) continue;
          visited.add(group.id); result.push({ group, depth });
          if (expanded.has(group.id)) visit(group.id, depth + 1);
        } else if (entry.page) {
          const page = entry.page; result.push({ page, depth });
          if (tab === "layers") for (const annotation of pageAnnotations.get(page.id) ?? []) result.push({ annotation, depth: depth + 1 });
        }
      }
      for (const annotation of annotationGroups.get(parent) ?? []) if (parent || tab === "layers") result.push({ annotation, depth });
    };
    visit(null, 0);
    return result;
  }, [childrenByGroup, pagesByGroup, expanded, state.annotations, tab]);
  const rowItems: SelectionItem[] = rows.map((row) => row.group ? { kind: "group", id: row.group.id } : row.page ? { kind: "page", id: row.page.id } : { kind: "annotation", id: row.annotation!.id });
  const selectedKeys = new Set(explicitSelection(state).map(selectionKey));
  const selectRow = (item: SelectionItem, event: React.MouseEvent) => {
    onSelectItem(item, rowItems, selectionAnchor.current, event);
    if (!event.shiftKey) selectionAnchor.current = item;
  };
  const annotationLabel = (annotation: Annotation) => annotation.type === "text" || annotation.type === "replacement" ? annotation.text || "Texto" : ({ ink: "Trazo", highlight: "Resaltado", rectangle: "Rectángulo" })[annotation.type];
  const renderAnnotation = (annotation: Annotation, depth: number) => <button type="button" aria-pressed={(state.selectedAnnotationIds ?? []).includes(annotation.id)} className={`flex h-9 w-full items-center gap-2 border-l-2 pr-2 text-left text-xs ${(state.selectedAnnotationIds ?? []).includes(annotation.id) ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:bg-muted"}`} style={{ paddingLeft: 8 + depth * 14 }} onClick={(event) => selectRow({ kind: "annotation", id: annotation.id }, event)}><span className="[&_svg]:size-3.5">{annotationIcon(annotation)}</span><span className="truncate">{annotationLabel(annotation)}</span></button>;

  const toggleExpanded = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const dropBefore = (targetId: string) => {
    if (!draggedIds.length || draggedIds.includes(targetId)) return;
    const moving = ordered.map((page) => page.id).filter((id) => draggedIds.includes(id));
    const ids = ordered.map((page) => page.id).filter((id) => !draggedIds.includes(id));
    ids.splice(ids.indexOf(targetId), 0, ...moving);
    onReorder(ids);
    setDraggedIds([]); setDropTarget(null);
  };

  const commitEditing = () => {
    if (!editing?.value.trim()) return setEditing(null);
    if (editing.type === "group") onRenameGroup(editing.id, editing.value);
    else onRenamePage(editing.id, editing.value);
    setEditing(null);
  };

  const createGroupRow = (
    <div className="flex items-center gap-1 border-b border-border px-2 py-2">
      <Input
        autoFocus
        aria-label="Nombre del grupo"
        value={newGroupName}
        onChange={(event) => setNewGroupName(event.target.value.slice(0, 80))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && newGroupName.trim()) {
            onCreateGroup(newGroupName, creatingParentId ?? null);
            setCreatingParentId(undefined);
          }
          if (event.key === "Escape") setCreatingParentId(undefined);
        }}
        className="h-8 min-w-0 text-xs"
      />
      <Button size="icon-sm" variant="ghost" aria-label="Crear grupo" onClick={() => {
        if (newGroupName.trim()) onCreateGroup(newGroupName, creatingParentId ?? null);
        setCreatingParentId(undefined);
      }}><Check data-icon="inline-start" /></Button>
      <Button size="icon-sm" variant="ghost" aria-label="Cancelar" onClick={() => setCreatingParentId(undefined)}><X data-icon="inline-start" /></Button>
    </div>
  );

  const renderPage = (page: EditorPage, depth: number) => {
    const selected = state.selectedPageIds.includes(page.id);
    const isEditing = editing?.type === "page" && editing.id === page.id;
    return (
      <div
        key={page.id}
        data-testid="page-rail-item"
        data-page-id={page.id}
        aria-selected={selected}
        draggable={!isEditing}
        className={`group flex h-9 items-center gap-1.5 border-l-2 pr-2 text-xs ${dropTarget === page.id ? "border-t-2 border-t-primary" : ""} ${selected ? "border-primary bg-primary/8" : "border-transparent hover:bg-muted"}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onDragStart={() => setDraggedIds(selected ? state.selectedPageIds : [page.id])}
        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDropTarget(page.id); }}
        onDragEnd={() => { setDraggedIds([]); setDropTarget(null); }}
        onDrop={(event) => { event.stopPropagation(); dropBefore(page.id); }}
        onClick={(event) => {
          if (isEditing) return;
          selectRow({ kind: "page", id: page.id }, event);
        }}
        onDoubleClick={() => isEditing ? undefined : setEditing({ type: "page", id: page.id, value: page.name })}
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-label="Página" />
        <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-foreground/8 font-mono text-[9px] text-muted-foreground">{page.order + 1}</span>
        {isEditing ? (
          <Input
            autoFocus
            aria-label="Nombre de página"
            value={editing.value}
            onChange={(event) => setEditing({ ...editing, value: event.target.value.slice(0, 100) })}
            onBlur={commitEditing}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitEditing();
              if (event.key === "Escape") setEditing(null);
            }}
            className="h-7 min-w-0 flex-1 px-1.5 text-xs"
          />
        ) : (
          <button type="button" className="min-w-0 flex-1 truncate text-left" onDoubleClick={() => onFocusPage(page)}>{page.name}</button>
        )}
        <span className="font-mono text-[9px] text-muted-foreground">{page.rotation || 0}°</span>
      </div>
    );
  };

  const renderGroup = (group: CanvasGroup, depth: number): React.ReactNode => {
    const children = childrenByGroup.get(group.id) ?? [];
    const pages = pagesByGroup.get(group.id) ?? [];
    const open = expanded.has(group.id);
    const isEditing = editing?.type === "group" && editing.id === group.id;
    return (
      <div key={group.id}>
        <div
          className={`flex h-9 items-center gap-1 pr-2 text-xs font-medium ${selectedKeys.has(`group:${group.id}`) ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (draggedIds.length) onMoveToGroup(draggedIds, group.id);
            setDraggedIds([]);
            setExpanded((current) => new Set(current).add(group.id));
          }}
        >
          <button type="button" aria-label={open ? "Contraer grupo" : "Expandir grupo"} className="grid size-6 shrink-0 place-items-center" onClick={() => toggleExpanded(group.id)}>
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          <Paperclip className="size-3.5 shrink-0" aria-label="Grupo" />
          {isEditing ? (
            <Input
              autoFocus
              aria-label="Nombre del grupo"
              value={editing.value}
              onChange={(event) => setEditing({ ...editing, value: event.target.value.slice(0, 80) })}
              onBlur={commitEditing}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitEditing();
                if (event.key === "Escape") setEditing(null);
              }}
              className="h-7 min-w-0 flex-1 px-1.5 text-xs"
            />
          ) : (
            <button type="button" data-collapse-target="true" className="min-w-0 flex-1 truncate text-left" onClick={(event) => selectRow({ kind: "group", id: group.id }, event)} onDoubleClick={() => setEditing({ type: "group", id: group.id, value: group.name })}>{group.name}</button>
          )}
          <ToolButton label={group.collapsed ? "Desplegar páginas del grupo" : "Colapsar páginas del grupo"} onClick={() => onToggleGroup(group.id)}>{group.collapsed ? <LayoutGrid /> : <Layers2 />}</ToolButton>
          <span className="font-mono text-[9px] text-muted-foreground">{pages.length + children.length + state.annotations.filter((annotation) => annotation.groupId === group.id).length}</span>
        </div>

      </div>
    );
  };

  const renderOutline = (items: DocumentOutlineItem[], sourceId: string, depth = 0): React.ReactNode => items.map((item) => {
    const page = item.pageIndex === null ? null : ordered.find((candidate) => candidate.sourceId === sourceId && candidate.sourcePageIndex === item.pageIndex);
    return (
      <div key={item.id}>
        <button
          type="button"
          disabled={!page}
          className="flex h-8 w-full items-center gap-2 pr-2 text-left text-xs hover:bg-muted disabled:opacity-55"
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => page && onFocusPage(page)}
        >
          <ListTree className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{item.title}</span>
          {page && <span className="font-mono text-[9px] text-muted-foreground">{page.order + 1}</span>}
        </button>
        {item.children.length > 0 && renderOutline(item.children, sourceId, depth + 1)}
      </div>
    );
  });


  return (
    <Tabs value={tab} onValueChange={(value) => { setTab(String(value)); selectionAnchor.current = null; }} className="h-full min-h-0 gap-0">
      <TabsList variant="line" className="h-11 w-full justify-start border-b border-border px-2">
        <TabsTrigger value="pages" className="px-2 text-xs">Páginas</TabsTrigger>
        <TabsTrigger value="layers" className="px-2 text-xs">Capas</TabsTrigger>
        <TabsTrigger value="outline" className="px-2 text-xs">Índice</TabsTrigger>
        <TabsTrigger value="search" className="px-2 text-xs">Buscar</TabsTrigger>
      </TabsList>
      <TabsContent value="pages" className="min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
            <ToolButton label="Agrupar selección" shortcut="Ctrl+G" disabled={!explicitSelection(state).length} onClick={() => { setNewGroupName("Grupo"); setCreatingParentId(null); }}><Paperclip /></ToolButton>

            <ToolButton label="Desagrupar selección" shortcut="Ctrl+Shift+G" disabled={!explicitSelection(state).length} onClick={() => onUngroup(state.selectedPageIds)}><PlayingCardsFan /></ToolButton>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">{state.pages.length}</span>
          </div>
          {creatingParentId !== undefined && createGroupRow}
          <p className="px-2 py-1 text-[10px] text-muted-foreground">Ctrl: añadir o quitar · Mayús: rango. Al organizar o exportar, la numeración se sincroniza con el canvas.</p>
          <VirtualRows count={rows.length} label="Estructura documental" renderRow={(index) => { const row = rows[index]; return row.group ? renderGroup(row.group, row.depth) : row.page ? renderPage(row.page, row.depth) : renderAnnotation(row.annotation!, row.depth); }} />
          {!state.pages.length && <p className="p-3 text-xs text-muted-foreground">Sin páginas.</p>}
          {state.selectedGroupId && (
            <div className="flex shrink-0 items-center border-t border-border p-2">
              <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{state.groups.find((group) => group.id === state.selectedGroupId)?.name}</span>
              <Button size="icon-sm" variant="ghost" aria-label="Desagrupar conservando páginas" onClick={() => onDeleteGroup(state.selectedGroupId!)}><X data-icon="inline-start" /></Button>
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="layers" className="min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col"><p className="px-3 py-2 text-xs text-muted-foreground">Ctrl: añadir o quitar · Mayús: seleccionar rango</p>
          <VirtualRows count={rows.length} label="Grupos, páginas y capas" renderRow={(index) => { const row = rows[index]; return row.group ? renderGroup(row.group, row.depth) : row.page ? renderPage(row.page, row.depth) : renderAnnotation(row.annotation!, row.depth); }} />
        </div>
      </TabsContent>
      <TabsContent value="outline" className="min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="py-1">
            {sources.map((source) => (
              <div key={source.id}>
                <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-xs font-medium"><FileText className="size-3.5" /><span className="truncate">{source.name}</span></div>
                {source.outline?.length ? renderOutline(source.outline, source.id) : <p className="px-4 py-3 text-xs text-muted-foreground">Sin índice.</p>}
              </div>
            ))}
            {!sources.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sin documentos.</p>}
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="search" className="min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="p-2"><InputGroup>
            <InputGroupInput ref={searchInputRef} aria-keyshortcuts="Control+f Meta+f" aria-label="Buscar en el documento" placeholder="Buscar palabras…" value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} />
            <InputGroupAddon><Search /></InputGroupAddon>
            {searchQuery && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="Limpiar búsqueda" onClick={() => onSearchChange("")}><X /></InputGroupButton></InputGroupAddon>}
          </InputGroup></div>
          <p className="px-3 py-2 text-xs text-muted-foreground" role="status">{searchResults.length} coincidencias</p>
          <ScrollArea className="min-h-0 flex-1">
            <div className="py-1">
              {searchResults.slice(0, 200).map((block) => {
                const page = state.pages.find((candidate) => candidate.id === block.pageId);
                if (!page) return null;
                return (
                  <div key={block.id} className="group flex min-h-12 items-center gap-2 border-b border-border/60 px-3 py-2 hover:bg-muted">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onFocusTextBlock(block)}>
                      <span className="block truncate text-xs">{block.text}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{page.name} · {block.source.toUpperCase()}</span>
                    </button>
                    <ToolButton label="Sustituir texto" onClick={() => onCreateReplacement(state.textBlocks.find((item) => item.id === block.blockId) ?? block)}><PencilLine /></ToolButton>
                  </div>
                );
              })}
              {searchResults.length > 200 && <p className="px-3 py-2 text-xs text-muted-foreground">Se muestran las primeras 200. Todas están resaltadas en el documento.</p>}
              {searchQuery && !searchResults.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sin resultados.</p>}
              {!searchQuery && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Escribe para buscar.</p>}
            </div>
          </ScrollArea>
        </div>
      </TabsContent>
    </Tabs>
  );
}
