"use client";
import { ContextMenuGroup } from "@/components/ui/context-menu";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Paperclip, Check, Copy, Download, FilePlus2, LayoutGrid, RotateCw, Trash2, Maximize2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaptureOverlay } from "./capture-overlay";
import { annotationBounds } from "@/lib/editor/canvas-export";
import { applySelection, explicitSelection, type SelectionItem } from "@/lib/editor/selection";
import { AnnotationLayer, type AnnotationDraft } from "./annotation-layer";
import { BoardAnnotationLayer } from "./board-annotation-layer";
import { VisiblePage } from "./visible-page";
import { PdfPageView } from "./pdf-page-view";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { visualPageBounds } from "@/lib/editor/group-view";
import { cameraForWheel } from "@/lib/editor/canvas-gestures";
import { cameraToFitPages } from "@/lib/editor/canvas-focus";
import { clampPointToPage } from "@/lib/editor/annotation-space";
import { type Bounds, boundsForPages, clientToWorld, fitBounds, zoomAt } from "@/lib/editor/geometry";
import { SearchHighlights } from "./search-highlights";
import { searchTextMatches, createReplacement } from "@/lib/editor/text-index";
import { pageIdsForSelection } from "@/lib/editor/model";
import type {
  Annotation,
  Camera,
  EditorPage,
  EditorState,
  StrokePoint,
} from "@/lib/editor/types";

type InfiniteCanvasProps = {
  onToggleGroup: (id: string) => void;
  searchQuery?: string;
  captureMode?: boolean;
  onCapture: (region: Bounds) => void;
  onCancelCapture: () => void;
  onSelectItems: (items: SelectionItem[]) => void;
  state: EditorState;
  documents: Map<string, PDFDocumentProxy>;
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
  onSelectPages: (pageIds: string[]) => void;
  onSelectGroup: (groupId: string) => void;
  onSelectAnnotation: (annotationId: string | null) => void;
  onMovePages: (pageIds: string[], deltaX: number, deltaY: number, annotationIds?: string[]) => void;
  onAddAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onMoveAnnotation: (annotationId: string, deltaX: number, deltaY: number) => void;
  onImport: () => void;
  onDuplicatePages: () => void;
  onRotatePages: () => void;
  onDeletePages: () => void;
  onExportSelection: () => void;
  onArrangeGrid: () => void;
  inkColor: string;
  highlightColor: string;
  inkSize: number;
  pressureEnabled: boolean;
  pressureSensitivity: number;
  strokeSmoothing: number;
  whiteboardMode: boolean;
  focusedTextBlockId?: string | null;
};

type DragState = {
  annotationIds?: string[];
  ids: string[];
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type PanState = {
  startX: number;
  startY: number;
  camera: Camera;
};

type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
};

function localPointFromClient(clientX: number, clientY: number, element: HTMLElement, page: EditorPage) {
  const rect = element.getBoundingClientRect();
  const radians = page.rotation * Math.PI / 180;
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  const scale = rect.width / Math.max(1, Math.abs(cosine) * page.width + Math.abs(sine) * page.height);
  const dx = (clientX - rect.left - rect.width / 2) / Math.max(0.001, scale);
  const dy = (clientY - rect.top - rect.height / 2) / Math.max(0.001, scale);
  const point = clampPointToPage({ x: cosine * dx + sine * dy + page.width / 2, y: -sine * dx + cosine * dy + page.height / 2 }, page);
  return { x: point.x + (page.crop?.x ?? 0), y: point.y + (page.crop?.y ?? 0) };
}

function inputPressure(pressure: number, enabled: boolean, sensitivity: number) {
  if (!enabled) return 0.5;
  const source = pressure > 0 ? pressure : 0.5;
  return Math.min(1, Math.max(0.05, 0.5 + (source - 0.5) * sensitivity));
}

export function InfiniteCanvas({
  onToggleGroup, captureMode = false, onCapture, onCancelCapture, onSelectItems,
  state,
  documents,
  camera,
  onCameraChange,
  onSelectPages,
  onSelectAnnotation,
  onMovePages,
  onAddAnnotation,
  onDeleteAnnotation,
  onMoveAnnotation,
  onImport,
  onDuplicatePages,
  onRotatePages,
  onDeletePages,
  onExportSelection,
  onArrangeGrid,
  inkColor,
  highlightColor,
  inkSize,
  pressureEnabled,
  pressureSensitivity,
  strokeSmoothing,
  whiteboardMode,
  focusedTextBlockId = null,
  searchQuery = "",
}: InfiniteCanvasProps) {
  const groupElements = useRef(new Map<string, HTMLDivElement>());
  const pageElements = useRef(new Map<string, HTMLDivElement>());
  const dragFrame = useRef<number | null>(null);
  const panFrame = useRef<number | null>(null);
  const pendingPan = useRef<Camera | null>(null);
  const pendingDrag = useRef({ x: 0, y: 0 });
  const collapsed = useMemo(() => new Set(state.groups.filter(g => g.collapsed).map(g => g.id)), [state.groups]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const selectionAnchorId = useRef<string | null>(null);
  const inkPointer = useRef<number | null>(null);
  const lastStackTap = useRef<{id:string; time:number} | null>(null);
  const touchStart = useRef<{x:number;y:number;stack:string|null} | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    distance: number;
    center: { x: number; y: number };
    camera: Camera;
  } | null>(null);

  const orderedPages = useMemo(
    () => [...state.pages].sort((a, b) => a.order - b.order),
    [state.pages],
  );
  const pagesByGroup = useMemo(() => {
    const result = new Map<string, EditorPage[]>();
    const parents = new Map(state.groups.map((group) => [group.id, group.parentId]));
    for (const page of orderedPages) {
      let id = page.groupId;
      const visited = new Set<string>();
      while (id && !visited.has(id)) {
        visited.add(id);
        const bucket = result.get(id) ?? [];
        bucket.push(page);
        result.set(id, bucket);
        id = parents.get(id) ?? null;
      }
    }
    return result;
  }, [state.groups, orderedPages]);
  const annotationsByGroup = useMemo(() => {
    const result = new Map<string, Annotation[]>();
    const parents = new Map(state.groups.map((group) => [group.id, group.parentId]));
    for (const annotation of state.annotations) {
      let id = annotation.groupId; const seen = new Set<string>();
      while (id && !seen.has(id)) { seen.add(id); const items = result.get(id) ?? []; items.push(annotation); result.set(id, items); id = parents.get(id); }
    }
    return result;
  }, [state.groups, state.annotations]);
  const groupBounds = useMemo(() => state.groups.flatMap((group) => {
    const pages = pagesByGroup.get(group.id) ?? [];
    const annotations = annotationsByGroup.get(group.id) ?? [];
    const marks = annotations.flatMap((annotation) => { const box = annotationBounds(annotation); return box ? [box] : []; });
    const attachedPages = new Set(annotations.map((annotation) => annotation.pageId));
    const bounds = boundsForPages([...pages.map(visualPageBounds), ...state.pages.filter((page) => attachedPages.has(page.id)).map(visualPageBounds), ...marks]);
    return bounds ? [{ group, bounds, pages, annotations }] : [];
  }), [state.groups, state.pages, pagesByGroup, annotationsByGroup]);
  const hiddenAnnotations = useMemo(() => {
    const ids = new Set<string>();
    for (const group of collapsed) for (const annotation of annotationsByGroup.get(group) ?? []) ids.add(annotation.id);
    return ids;
  }, [collapsed, annotationsByGroup]);
  const movingMarks = useRef<SVGElement[]>([]);
  useEffect(() => {
    const ids = new Set(drag?.annotationIds ?? []);
    movingMarks.current = Array.from(rootRef.current?.querySelectorAll<SVGElement>('[data-board-annotation]') ?? []).filter((element) => ids.has(element.dataset.boardAnnotation!));
  }, [drag]);
  const hiddenPages = useMemo(() => {
    const ids = new Set<string>();
    for (const group of collapsed) for (const page of pagesByGroup.get(group) ?? []) ids.add(page.id);
    return ids;
  }, [collapsed, pagesByGroup]);
  const annotationsByPage = useMemo(() => {
    const result = new Map<string, Annotation[]>();
    for (const annotation of state.annotations) if (annotation.pageId) {
      const bucket = result.get(annotation.pageId) ?? [];
      bucket.push(annotation);
      result.set(annotation.pageId, bucket);
    }
    return result;
  }, [state.annotations]);
  const searchMatches = useMemo(() => searchTextMatches(state.textBlocks, searchQuery), [state.textBlocks, searchQuery]);
  const selectedIds = useMemo(() => new Set(state.selectedPageIds), [state.selectedPageIds]);
  const draggedIds = useMemo(() => new Set(drag?.ids ?? []), [drag]);
  const updateDrag = (clientX: number, clientY: number) => {
    if (!drag) return;
    pendingDrag.current = { x: (clientX - drag.startX) / camera.zoom, y: (clientY - drag.startY) / camera.zoom };
    if (dragFrame.current !== null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      const transform = `translate(${pendingDrag.current.x}px, ${pendingDrag.current.y}px)`;
      for (const id of drag.ids) { const element = pageElements.current.get(id); if (element) element.style.translate = `${pendingDrag.current.x}px ${pendingDrag.current.y}px`; }
      for (const element of movingMarks.current) element.setAttribute("transform", `translate(${pendingDrag.current.x} ${pendingDrag.current.y})`);
      for (const { group, pages, annotations } of groupBounds) if (pages.every((page) => draggedIds.has(page.id)) && annotations.every((annotation) => drag.annotationIds?.includes(annotation.id))) {
        const element = groupElements.current.get(group.id); if (element) element.style.transform = transform;
      }
    });
  };
  const cancelGesture = () => {
    if (panFrame.current !== null) cancelAnimationFrame(panFrame.current);
    panFrame.current = null; pendingPan.current = null;
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    for (const element of pageElements.current.values()) element.style.translate = "";
    for (const element of groupElements.current.values()) element.style.transform = "";
    for (const element of movingMarks.current) element.removeAttribute("transform");
    setDrag(null); setDraft(null); setPan(null); setMarquee(null);
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      touches.current.clear(); gesture.current=null; inkPointer.current=null;
      cancelGesture();
    });
    return () => cancelAnimationFrame(frame);
  }, [state.tool]);
  useEffect(() => {
    const cancel = () => { touches.current.clear(); gesture.current=null; inkPointer.current=null; cancelGesture(); };
    window.addEventListener("blur",cancel);
    return () => window.removeEventListener("blur",cancel);
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancelGesture(); };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current); if (panFrame.current !== null) cancelAnimationFrame(panFrame.current); };
  }, []);

  const fitPages = (pages: EditorPage[]) => {
    const fitted = cameraToFitPages(pages, rootRef.current);
    if (fitted) onCameraChange(fitted);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let pendingCamera = camera;
    let wheelFrame: number | null = null;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (captureMode || drag) return;
      const rect = root.getBoundingClientRect();
      pendingCamera = cameraForWheel(
        pendingCamera,
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        { ...event, deltaX: event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1), deltaY: event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1), ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey },
      );
      if (wheelFrame === null) wheelFrame = requestAnimationFrame(() => { wheelFrame = null; onCameraChange(pendingCamera); });
    };
    const preventBrowserGesture = (event: Event) => event.preventDefault();
    root.addEventListener("wheel", handleWheel, { passive: false });
    root.addEventListener("gesturestart", preventBrowserGesture, { passive: false });
    root.addEventListener("gesturechange", preventBrowserGesture, { passive: false });
    return () => {
      if (wheelFrame !== null) cancelAnimationFrame(wheelFrame);
      root.removeEventListener("wheel", handleWheel);
      root.removeEventListener("gesturestart", preventBrowserGesture);
      root.removeEventListener("gesturechange", preventBrowserGesture);
    };
  }, [camera, onCameraChange, captureMode, drag]);

  const beginPan = (clientX: number, clientY: number) => {
    setPan({ startX: clientX, startY: clientY, camera });
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset.canvasStage) return;
    if (state.tool === "hand" || event.button === 1 || event.button === 2) {
      event.currentTarget.setPointerCapture(event.pointerId);
      beginPan(event.clientX, event.clientY);
      return;
    }
    if (state.tool === "select" && event.button === 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.setPointerCapture(event.pointerId);
      setMarquee({
        startX: event.clientX - rect.left,
        startY: event.clientY - rect.top,
        currentX: event.clientX - rect.left,
        currentY: event.clientY - rect.top,
        additive: event.ctrlKey || event.metaKey || event.shiftKey,
      });
      return;
    }
    onSelectAnnotation(null);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    if (drag) { updateDrag(event.clientX, event.clientY); return; }
    if (marquee) {
      const rect = event.currentTarget.getBoundingClientRect();
      setMarquee({ ...marquee, currentX: event.clientX - rect.left, currentY: event.clientY - rect.top });
      return;
    }
    if (pan) {
      pendingPan.current = {
        ...pan.camera,
        x: pan.camera.x + event.clientX - pan.startX,
        y: pan.camera.y + event.clientY - pan.startY,
      };
      if (panFrame.current === null) panFrame.current = requestAnimationFrame(() => { panFrame.current = null; if (pendingPan.current) onCameraChange(pendingPan.current); });
    }
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panFrame.current !== null) { cancelAnimationFrame(panFrame.current); panFrame.current = null; if (pendingPan.current) onCameraChange(pendingPan.current); pendingPan.current = null; }
    if (drag) { handlePagePointerUp(event); return; }
    if (marquee) {
      const start = clientToWorld({ x: marquee.startX, y: marquee.startY }, camera);
      const end = clientToWorld({ x: marquee.currentX, y: marquee.currentY }, camera);
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const bottom = Math.max(start.y, end.y);
      const isClick = Math.abs(marquee.currentX - marquee.startX) < 3 && Math.abs(marquee.currentY - marquee.startY) < 3;
      const hits = isClick ? [] : orderedPages
        .filter((page) => page.x < right && page.x + page.width > left && page.y < bottom && page.y + page.height > top)
        .map((page) => page.id);
      const annotationHits = isClick ? [] : state.annotations.filter((annotation) => {
        if (hiddenAnnotations.has(annotation.id)) return false;
        const box = annotationBounds(annotation);
        return box && box.x < right && box.x + box.width > left && box.y < bottom && box.y + box.height > top;
      }).map((annotation) => ({ kind: "annotation" as const, id: annotation.id }));
      onSelectItems([...(marquee.additive ? explicitSelection(state) : []), ...hits.map((id) => ({ kind: "page" as const, id })), ...annotationHits]);
      setMarquee(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPan(null);
  };

  const touchPoint = (event: React.PointerEvent) => {
    const rect = rootRef.current!.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  };
  const handleTouchDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (captureMode || event.pointerType !== "touch") return;
    const target = event.target as HTMLElement;
    if (target.closest('button:not([data-group-handle]), input, textarea, [contenteditable="true"], [role="menu"]')) return;
    if (state.tool === "ink") {
      if (inkPointer.current === null) { inkPointer.current=event.pointerId; return; }
      event.preventDefault(); event.stopPropagation(); return;
    }
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    touches.current.set(event.pointerId, touchPoint(event));
    const points = [...touches.current.values()];
    if (points.length === 1) {
      const stack = target.closest<HTMLElement>('[data-group-stack], [data-group-handle]');
      const groupId = stack?.dataset.groupStack ?? stack?.dataset.groupHandle;
      const pageId = target.closest<HTMLElement>('[data-page-id]')?.dataset.pageId;
      touchStart.current = {x:event.clientX,y:event.clientY,stack:groupId ?? null};
      if (state.tool === "select" && (groupId || pageId)) {
        const item: SelectionItem = groupId ? {kind:"group",id:groupId} : {kind:"page",id:pageId!};
        const preserve = groupId ? explicitSelection(state).some(i => i.kind === "group" && i.id === groupId) : state.selectedPageIds.includes(pageId!);
        const items = preserve ? explicitSelection(state) : [item];
        const selected = applySelection(state,items); onSelectItems(items);
        setDrag({ids:selected.selectedPageIds,annotationIds:selected.selectedAnnotationIds,startX:event.clientX,startY:event.clientY,currentX:event.clientX,currentY:event.clientY});
      } else beginPan(event.clientX,event.clientY);
    } else if (points.length === 2) {
      cancelGesture(); touchStart.current=null;
      gesture.current = {distance:Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y),center:{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2},camera};
    }
  };
  const handleTouchMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if(event.pointerType !== "touch") return;
    if(state.tool === "ink") { if(inkPointer.current !== event.pointerId) {event.preventDefault();event.stopPropagation();} return; }
    if(!touches.current.has(event.pointerId)) return;
    event.preventDefault(); event.stopPropagation();
    touches.current.set(event.pointerId,touchPoint(event));
    const points=[...touches.current.values()];
    if(points.length === 1) {
      if(drag) updateDrag(event.clientX,event.clientY);
      else if(pan) onCameraChange({...pan.camera,x:pan.camera.x+event.clientX-pan.startX,y:pan.camera.y+event.clientY-pan.startY});
    } else if(points.length === 2 && gesture.current) {
      const distance=Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
      const center={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
      const zoomed=zoomAt(gesture.current.camera,gesture.current.center,gesture.current.camera.zoom*distance/Math.max(1,gesture.current.distance));
      onCameraChange({...zoomed,x:zoomed.x+center.x-gesture.current.center.x,y:zoomed.y+center.y-gesture.current.center.y});
    }
  };
  const handleTouchUpCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if(event.pointerType !== "touch") return;
    if(state.tool === "ink") {
      if(inkPointer.current === event.pointerId) {inkPointer.current=null; if(event.type === "pointercancel") cancelGesture();}
      else {event.preventDefault();event.stopPropagation();}
      return;
    }
    if(!touches.current.has(event.pointerId)) return;
    event.preventDefault(); event.stopPropagation();
    if(event.type === "pointercancel") {touches.current.clear();gesture.current=null;touchStart.current=null;cancelGesture();return;}
    const start=touchStart.current;
    if(drag) handlePagePointerUp(event);
    else setPan(null);
    if(start?.stack && Math.hypot(event.clientX-start.x,event.clientY-start.y)<6) {
      const now=event.timeStamp;
      if(lastStackTap.current?.id===start.stack && now-lastStackTap.current.time<350) {onToggleGroup(start.stack);lastStackTap.current=null;}
      else lastStackTap.current={id:start.stack,time:now};
    }
    touchStart.current=null; touches.current.delete(event.pointerId); gesture.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if(touches.current.size===1) {
      const point=[...touches.current.values()][0]; const rect=event.currentTarget.getBoundingClientRect();
      beginPan(point.x+rect.left,point.y+rect.top);
    }
  };

  const handlePagePointerDown = (event: React.PointerEvent<HTMLDivElement>, page: EditorPage) => {
    if (event.pointerType === "touch" && state.tool !== "ink") return;
    event.stopPropagation();
    if (event.button !== 0) return;
    rootRef.current?.focus({ preventScroll: true });
    const element = event.currentTarget;
    const point = localPointFromClient(event.clientX, event.clientY, element, page);

    if (state.tool === "hand") {
      element.setPointerCapture(event.pointerId);
      beginPan(event.clientX, event.clientY);
      return;
    }

    if (state.tool === "ink" || state.tool === "highlight") {
      element.setPointerCapture(event.pointerId);
      const pressure = inputPressure(event.pressure, pressureEnabled, pressureSensitivity);
      setDraft({
        type: state.tool,
        pageId: page.id,
        points: [[point.x, point.y, pressure]],
        color: state.tool === "highlight" ? highlightColor : inkColor,
        size: state.tool === "highlight" ? Math.max(18, inkSize * 4) : inkSize,
        opacity: state.tool === "highlight" ? 0.34 : 1,
        pressureEnabled,
        smoothing: strokeSmoothing,
      });
      return;
    }

    if (state.tool === "rectangle") {
      element.setPointerCapture(event.pointerId);
      setDraft({ type: "rectangle", pageId: page.id, x: point.x, y: point.y, width: 0, height: 0, color: inkColor, fillColor: inkColor });
      return;
    }

    if (state.tool === "text") {
      const width = Math.min(180, page.width);
      const height = Math.min(54, page.height);
      onAddAnnotation({
        id: crypto.randomUUID(),
        pageId: page.id,
        type: "text",
        x: Math.min(point.x, (page.crop?.x ?? 0) + page.width - width),
        y: Math.min(point.y, (page.crop?.y ?? 0) + page.height - height),
        width,
        height,
        text: "Texto",
        fontSize: 16,
        color: inkColor,
        opacity: 1,
      });
      return;
    }

    if (state.tool === "edit-text") {
      const block = state.textBlocks
        .filter((item) => item.pageId === page.id)
        .find((item) => point.x >= item.x - 3 && point.x <= item.x + item.width + 3 && point.y >= item.y - 3 && point.y <= item.y + item.height + 3);
      if (block) onAddAnnotation(createReplacement(block, block.text));
      return;
    }

    if (state.tool !== "select") return;
    const ids = state.selectedPageIds.includes(page.id) && !event.shiftKey && !event.ctrlKey && !event.metaKey
      ? state.selectedPageIds
      : pageIdsForSelection(orderedPages, state.selectedPageIds, page.id, {
          range: event.shiftKey,
          toggle: event.ctrlKey || event.metaKey,
          anchorId: selectionAnchorId.current,
        });
    const preserve = state.selectedPageIds.includes(page.id) && !event.shiftKey && !event.ctrlKey && !event.metaKey;
    if (!preserve) onSelectPages(ids);
    if (!event.shiftKey) selectionAnchorId.current = page.id;
    element.setPointerCapture(event.pointerId);
    setDrag({ ids, annotationIds: preserve ? state.selectedAnnotationIds : [], startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY });
  };

  const handlePagePointerMove = (event: React.PointerEvent<HTMLDivElement>, page: EditorPage) => {
    if (drag) {
      updateDrag(event.clientX, event.clientY);
      return;
    }
    if (!draft || draft.pageId !== page.id) return;
    if (draft.type === "ink" || draft.type === "highlight") {
      const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
      const next = nativeEvents.map((nativeEvent) => {
        const point = localPointFromClient(nativeEvent.clientX, nativeEvent.clientY, event.currentTarget, page);
        return [point.x, point.y, inputPressure(nativeEvent.pressure, pressureEnabled, pressureSensitivity)] as StrokePoint;
      });
      setDraft({ ...draft, points: [...draft.points, ...next] });
    } else if (draft.type === "rectangle") {
      const point = localPointFromClient(event.clientX, event.clientY, event.currentTarget, page);
      setDraft({
        ...draft,
        width: point.x - draft.x,
        height: point.y - draft.y,
      });
    }
  };

  const handlePagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (panFrame.current !== null) { cancelAnimationFrame(panFrame.current); panFrame.current = null; if (pendingPan.current) onCameraChange(pendingPan.current); pendingPan.current = null; }
    setPan(null);
    if (drag) {
      const deltaX = (event.clientX - drag.startX) / camera.zoom;
      const deltaY = (event.clientY - drag.startY) / camera.zoom;
      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
        onMovePages(drag.ids, deltaX, deltaY, drag.annotationIds);

      }
      cancelGesture();
    }
    if (draft) {
      if ((draft.type === "ink" || draft.type === "highlight") && draft.points.length > 1) {
        onAddAnnotation({ id: crypto.randomUUID(), ...draft });
      }
      if (draft.type === "rectangle" && Math.abs(draft.width) > 4 && Math.abs(draft.height) > 4) {
        onAddAnnotation({
          id: crypto.randomUUID(),
          pageId: draft.pageId,
          type: "rectangle",
          x: draft.width < 0 ? draft.x + draft.width : draft.x,
          y: draft.height < 0 ? draft.y + draft.height : draft.y,
          width: Math.abs(draft.width),
          height: Math.abs(draft.height),
          color: draft.color,
          fillColor: draft.fillColor,
          fillOpacity: 0.12,
          opacity: 1,
          size: 2,
        });
      }
      setDraft(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const boardPointFromClient = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return clientToWorld({ x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }, camera);
  };

  const handleBoardPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!whiteboardMode || (event.pointerType === "touch" && state.tool !== "ink")) return;
    const point = boardPointFromClient(event.clientX, event.clientY);
    if (state.tool === "ink" || state.tool === "highlight") {
      event.currentTarget.setPointerCapture(event.pointerId);
      const pressure = inputPressure(event.pressure, pressureEnabled, pressureSensitivity);
      setDraft({
        type: state.tool,
        pageId: null,
        points: [[point.x, point.y, pressure]],
        color: state.tool === "highlight" ? highlightColor : inkColor,
        size: state.tool === "highlight" ? Math.max(18, inkSize * 4) : inkSize,
        opacity: state.tool === "highlight" ? 0.34 : 1,
        pressureEnabled,
        smoothing: strokeSmoothing,
      });
      return;
    }
    if (state.tool === "rectangle") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraft({ type: "rectangle", pageId: null, x: point.x, y: point.y, width: 0, height: 0, color: inkColor, fillColor: inkColor });
      return;
    }
    if (state.tool === "text") {
      onAddAnnotation({
        id: crypto.randomUUID(),
        pageId: null,
        type: "text",
        x: point.x,
        y: point.y,
        width: 180,
        height: 54,
        text: "Texto",
        fontSize: 16,
        color: inkColor,
        opacity: 1,
      });
      return;
    }
    if (state.tool === "select") {
      onSelectAnnotation(null);
      onSelectPages([]);
    }
  };

  const handleBoardPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draft || draft.pageId !== null) return;
    if (draft.type === "ink" || draft.type === "highlight") {
      const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
      const next = nativeEvents.map((nativeEvent) => {
        const point = boardPointFromClient(nativeEvent.clientX, nativeEvent.clientY);
        return [point.x, point.y, inputPressure(nativeEvent.pressure, pressureEnabled, pressureSensitivity)] as StrokePoint;
      });
      setDraft({ ...draft, points: [...draft.points, ...next] });
    } else if (draft.type === "rectangle") {
      const point = boardPointFromClient(event.clientX, event.clientY);
      setDraft({ ...draft, width: point.x - draft.x, height: point.y - draft.y });
    }
  };

  const handleBoardPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (draft?.pageId === null) {
      if ((draft.type === "ink" || draft.type === "highlight") && draft.points.length > 1) {
        onAddAnnotation({ id: crypto.randomUUID(), ...draft });
      }
      if (draft.type === "rectangle" && Math.abs(draft.width) > 4 && Math.abs(draft.height) > 4) {
        onAddAnnotation({
          id: crypto.randomUUID(),
          pageId: null,
          type: "rectangle",
          x: draft.width < 0 ? draft.x + draft.width : draft.x,
          y: draft.height < 0 ? draft.y + draft.height : draft.y,
          width: Math.abs(draft.width),
          height: Math.abs(draft.height),
          color: draft.color,
          fillColor: draft.fillColor,
          fillOpacity: 0.12,
          opacity: 1,
          size: 2,
        });
      }
      setDraft(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const renderPageShell = (page: EditorPage) => {
          const selected = selectedIds.has(page.id);
          const dragged = draggedIds.has(page.id);
          const x = page.x;
          const y = page.y;

          return (
            <div
              key={page.id}
              ref={(element) => { if (element) pageElements.current.set(page.id, element); else pageElements.current.delete(page.id); }}
              data-testid="pdf-page"
              data-page-id={page.id}
              data-selected={selected ? "true" : "false"}
              className={`${page.groupId ? "group-stack-preview" : ""} group/page absolute select-none bg-white shadow-[0_10px_35px_rgba(31,35,40,0.12)] outline outline-1 outline-black/10 ${selected ? "ring-[3px] ring-primary ring-offset-[3px] ring-offset-canvas" : ""}`}
              style={{
                width: page.width,
                height: page.height,
                transform: `translate(${x}px, ${y}px) rotate(${page.rotation}deg)`,
                transformOrigin: "center",
                touchAction: "none",
                cursor: state.tool === "select" ? (dragged ? "grabbing" : "default") : state.tool === "hand" ? "grab" : "crosshair",
              }}
              onPointerDown={(event) => handlePagePointerDown(event, page)}
              onPointerMove={(event) => handlePagePointerMove(event, page)}
              onPointerUp={handlePagePointerUp}
              onPointerCancel={cancelGesture}
              onContextMenu={() => {
                if (!state.selectedPageIds.includes(page.id)) onSelectPages([page.id]);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                fitPages([page]);
              }}
            >
              <VisiblePage>{() => <div className="absolute inset-0 overflow-hidden"><div style={{ width: page.sourceWidth ?? page.width, height: page.sourceHeight ?? page.height, transform: `translate(${- (page.crop?.x ?? 0)}px, ${- (page.crop?.y ?? 0)}px)` }}>
              <PdfPageView
                document={documents.get(page.sourceId)}
                pageIndex={page.sourcePageIndex}
                width={page.sourceWidth ?? page.width}
                height={page.sourceHeight ?? page.height}
                zoom={camera.zoom}
                className="absolute inset-0 overflow-hidden"
              />
              <AnnotationLayer
                pageId={page.id}
                width={page.sourceWidth ?? page.width}
                height={page.sourceHeight ?? page.height}
                annotations={annotationsByPage.get(page.id) ?? []}
                draft={draft}
                selectedAnnotationId={state.selectedAnnotationId} selectedAnnotationIds={state.selectedAnnotationIds}
                interactive={state.tool === "select"}
                erasing={state.tool === "eraser"}
                onSelect={onSelectAnnotation}
                onErase={onDeleteAnnotation}
                onMove={onMoveAnnotation}
              />
              <SearchHighlights matches={searchMatches.filter((match) => match.pageId === page.id)} activeId={focusedTextBlockId} />
              </div></div>}</VisiblePage>
              <span className="absolute left-0 top-0 flex max-w-full -translate-y-[calc(100%+6px)] items-center gap-1.5 rounded-sm bg-foreground px-1 py-1 text-[10px] text-background shadow-sm">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  aria-label={`Seleccionar ${page.order + 1} ${page.name}`}
                  className={`grid size-4 shrink-0 place-items-center rounded-[2px] border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-background/45 bg-background/10"}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectPages(selected ? state.selectedPageIds.filter((id) => id !== page.id) : [...state.selectedPageIds, page.id]);
                  }}
                >
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </button>
                <strong className="font-mono">{page.order + 1}</strong><span className="truncate font-sans">{page.name}</span>
              </span>
            </div>
          );
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger render={
    <div
      ref={rootRef}
      tabIndex={-1}
      className={`canvas-root relative h-full w-full overflow-hidden bg-canvas ${state.tool === "hand" ? "cursor-grab active:cursor-grabbing" : ""}`}
      onContextMenuCapture={event => { if(touches.current.size || inkPointer.current !== null) {event.preventDefault();event.stopPropagation();} }}
      onPointerDownCapture={handleTouchDownCapture}
      onPointerMoveCapture={handleTouchMoveCapture}
      onPointerUpCapture={handleTouchUpCapture}
      onPointerCancelCapture={handleTouchUpCapture}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={cancelGesture}
      onDoubleClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('button, input, textarea, a, [contenteditable="true"], [data-group-stack]')) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const point = clientToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, camera);
        const page = [...orderedPages].reverse().find((item) => {
          if (hiddenPages.has(item.id)) return false;
          const angle = -item.rotation * Math.PI / 180;
          const dx = point.x - item.x - item.width / 2, dy = point.y - item.y - item.height / 2;
          return Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= item.width / 2 && Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= item.height / 2;
        });
        if (page) { event.stopPropagation(); cancelGesture(); fitPages([page]); }
      }}
              onDoubleClick={(event) => {
        if (event.target === event.currentTarget) fitPages(state.pages);
      }}
    >
      {state.pages.length === 0 && (
        <button
          type="button"
          className="absolute inset-0 m-auto flex h-36 w-[min(360px,calc(100%-40px))] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-background/70 text-sm text-muted-foreground shadow-sm backdrop-blur-sm hover:border-foreground/40 hover:text-foreground"
          onClick={onImport}
        >
          <FilePlus2 className="size-6" />
          <span>Abre o arrastra un PDF para empezar.</span>
        </button>
      )}
      <div
        data-testid="canvas-stage"
        data-canvas-stage="true"
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
      >
        {groupBounds.map(({ group, bounds, pages, annotations }) => {
          const padding = 38;
          const parents = new Map(state.groups.map((item) => [item.id, item.parentId]));
          let ancestor = group.parentId;
          const visited = new Set<string>();
          while (ancestor && !visited.has(ancestor)) {
            if (collapsed.has(ancestor)) return null;
            visited.add(ancestor); ancestor = parents.get(ancestor) ?? null;
          }
          return (
            <div
              key={group.id}
              ref={(element) => { if (element) groupElements.current.set(group.id, element); else groupElements.current.delete(group.id); }}
              className={`group-stack absolute border border-dashed ${(state.selectedGroupIds ?? [state.selectedGroupId]).includes(group.id) ? "border-primary bg-primary/4" : "border-foreground/20 bg-background/10"}`}
              style={{ left: bounds.x - padding, top: bounds.y - padding, width: collapsed.has(group.id) ? (pages[0] ? visualPageBounds(pages[0]).width : 260) + padding * 2 + 24 : bounds.width + padding * 2, height: collapsed.has(group.id) ? (pages[0] ? visualPageBounds(pages[0]).height : 90) + padding * 2 + 24 : bounds.height + padding * 2, pointerEvents: "none" }}
            >
              <button
                type="button"
                data-group-handle={group.id} data-collapse-target="true"
                className="absolute left-0 top-0 flex h-7 max-w-64 -translate-y-full items-center gap-2 rounded-t-sm border border-b-0 border-inherit bg-background/95 px-2 text-xs font-medium shadow-sm"
                style={{ pointerEvents: "auto" }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (state.tool !== "select" || event.button !== 0) return;
                  const selected = explicitSelection(state);
                  const already = selected.some((item) => item.kind === "group" && item.id === group.id);
                  const additive = event.ctrlKey || event.metaKey || event.shiftKey;
                  const items: SelectionItem[] = additive ? (already ? selected.filter((item) => item.kind !== "group" || item.id !== group.id) : [...selected, { kind: "group", id: group.id }]) : already ? selected : [{ kind: "group", id: group.id }];
                  const next = applySelection(state, items); onSelectItems(items);
                  rootRef.current?.setPointerCapture(event.pointerId);
                  setDrag({ ids: next.selectedPageIds, annotationIds: next.selectedAnnotationIds, startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY });
                }}

              >
                <Paperclip className="size-4 shrink-0" />
                <span className="truncate">{group.name} · {pages.length} pág. · {annotations.length} capas</span>
              </button>
              <button type="button" className="absolute right-0 top-0 bg-background px-2 py-1 text-xs" style={{ pointerEvents: "auto" }} aria-label={`${collapsed.has(group.id) ? "Desplegar" : "Colapsar"} ${group.name}`} aria-expanded={!collapsed.has(group.id)} onPointerDown={(event) => event.stopPropagation()} onClick={() => onToggleGroup(group.id)}>{collapsed.has(group.id) ? "Desplegar" : "Plegar"}</button>
              {collapsed.has(group.id) && <div data-group-stack={group.id} data-testid="group-stack" className="group-stack-preview absolute cursor-move" style={{left:padding, top:padding, width:pages[0] ? visualPageBounds(pages[0]).width : 260, height:pages[0] ? visualPageBounds(pages[0]).height : 90, pointerEvents:"auto"}}
                onDoubleClick={event => {event.stopPropagation(); onToggleGroup(group.id);}}
                onPointerDown={event => {
                  if(event.pointerType === "touch") return;
                  event.stopPropagation(); if(event.button !== 0) return;
                  if(state.tool === "hand") { rootRef.current?.setPointerCapture(event.pointerId); beginPan(event.clientX,event.clientY); return; }
                  if(state.tool !== "select") return;
                  const items: SelectionItem[] = explicitSelection(state).some(i => i.kind === "group" && i.id === group.id) ? explicitSelection(state) : [{kind:"group",id:group.id}];
                  const selected = applySelection(state, items); onSelectItems(items); rootRef.current?.setPointerCapture(event.pointerId);
                  setDrag({ids:selected.selectedPageIds,annotationIds:selected.selectedAnnotationIds,startX:event.clientX,startY:event.clientY,currentX:event.clientX,currentY:event.clientY});
                }}>
                {[2,1].map(index => <div key={index} className="absolute inset-0 border border-foreground/20 bg-white shadow-md" style={{transform:`translate(${index*10}px,${index*10}px)`}} />)}
                {pages[0] && <div className="absolute inset-0 overflow-hidden bg-white shadow-lg" style={{pointerEvents:"none"}}><div className="absolute left-1/2 top-1/2" style={{width:pages[0].width,height:pages[0].height,marginLeft:-pages[0].width/2,marginTop:-pages[0].height/2,transform:`rotate(${pages[0].rotation}deg)`}}>
                  <VisiblePage><div style={{width:pages[0].sourceWidth ?? pages[0].width,height:pages[0].sourceHeight ?? pages[0].height,transform:`translate(${- (pages[0].crop?.x ?? 0)}px,${- (pages[0].crop?.y ?? 0)}px)`}}><PdfPageView document={documents.get(pages[0].sourceId)} pageIndex={pages[0].sourcePageIndex} width={pages[0].sourceWidth ?? pages[0].width} height={pages[0].sourceHeight ?? pages[0].height} zoom={camera.zoom} />
                  <AnnotationLayer pageId={pages[0].id} width={pages[0].sourceWidth ?? pages[0].width} height={pages[0].sourceHeight ?? pages[0].height} annotations={annotationsByPage.get(pages[0].id) ?? []} draft={null} selectedAnnotationId={null} interactive={false} erasing={false} onSelect={() => undefined} onErase={() => undefined} onMove={() => undefined} /></div></VisiblePage>
                </div></div>}
                <span className="absolute bottom-2 right-2 rounded bg-background px-2 py-1 text-xs shadow">{pages.length} páginas</span>
              </div>}
            </div>
          );
        })}
        {orderedPages.filter((page) => !hiddenPages.has(page.id)).map(renderPageShell)}
      </div>
      <BoardAnnotationLayer
        camera={camera}
        annotations={state.annotations.filter((annotation) => !hiddenAnnotations.has(annotation.id))}
        draft={draft}
        selectedAnnotationId={state.selectedAnnotationId} selectedAnnotationIds={state.selectedAnnotationIds}
        active={whiteboardMode && state.tool !== "hand"}
        erasing={state.tool === "eraser"}
        onSelect={(id, event) => {
          const selected = explicitSelection(state); const already = selected.some((item) => item.kind === "annotation" && item.id === id);
          const additive = event.ctrlKey || event.metaKey || event.shiftKey;
          const items: SelectionItem[] = additive ? (already ? selected.filter((item) => item.kind !== "annotation" || item.id !== id) : [...selected, { kind: "annotation", id }]) : already ? selected : [{ kind: "annotation", id }];
          const next = applySelection(state, items); onSelectItems(items);
          rootRef.current?.setPointerCapture(event.pointerId);
          setDrag({ ids: next.selectedPageIds, annotationIds: next.selectedAnnotationIds, startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY });
        }}
        onErase={onDeleteAnnotation}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
      />
      {captureMode && <CaptureOverlay camera={camera} onCapture={onCapture} onCancel={onCancelCapture} />}
      {marquee && (
        <div
          data-testid="selection-marquee"
          className="pointer-events-none absolute z-50 border border-primary bg-primary/15"
          style={{
            left: Math.min(marquee.startX, marquee.currentX),
            top: Math.min(marquee.startY, marquee.currentY),
            width: Math.abs(marquee.currentX - marquee.startX),
            height: Math.abs(marquee.currentY - marquee.startY),
          }}
        />
      )}
      {state.pages.length > 0 && (
        <Button data-testid="zoom-status" variant="outline" size="sm" aria-label="Restablecer zoom al 100 %" title="Restablecer zoom al 100 %" className="absolute bottom-16 right-3 font-mono text-xs sm:bottom-3" onClick={() => { const root = rootRef.current; if (root) onCameraChange(zoomAt(camera, { x: root.clientWidth / 2, y: root.clientHeight / 2 }, 1)); }}>
          {Math.round(camera.zoom * 100)}%
        </Button>
      )}
    </div>
      } />
      <ContextMenuContent className="min-w-52"><ContextMenuGroup>
        {state.selectedPageIds.length > 0 ? <>
          <ContextMenuItem onClick={onExportSelection}><Download /> Exportar selección</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => fitPages(state.pages.filter((page) => state.selectedPageIds.includes(page.id)))} disabled={!state.selectedPageIds.length}><ZoomIn /> Enfocar selección</ContextMenuItem>
          <ContextMenuItem onClick={() => fitPages(state.pages)} disabled={!state.pages.length}><Maximize2 /> Ajustar todo</ContextMenuItem>
          <ContextMenuItem onClick={onDuplicatePages}><Copy /> Duplicar</ContextMenuItem>
          <ContextMenuItem onClick={onRotatePages}><RotateCw /> Girar derecha</ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={onDeletePages}><Trash2 /> Eliminar</ContextMenuItem>
        </> : <>
          <ContextMenuItem onClick={onImport}><FilePlus2 /> Abrir PDF</ContextMenuItem>
          <ContextMenuItem onClick={() => onSelectPages(state.pages.map((page) => page.id))} disabled={!state.pages.length}><Check /> Seleccionar todo</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onArrangeGrid} disabled={!state.pages.length}><LayoutGrid /> Cuadrícula</ContextMenuItem>
          <ContextMenuItem onClick={() => fitPages(state.pages)} disabled={!state.pages.length}>Ajustar</ContextMenuItem>
        </>}
      </ContextMenuGroup></ContextMenuContent>
    </ContextMenu>
  );
}
