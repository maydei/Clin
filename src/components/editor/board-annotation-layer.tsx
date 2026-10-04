"use client";

import { strokeToPath } from "@/lib/editor/annotation-path";
import type { Annotation, Camera } from "@/lib/editor/types";
import type { AnnotationDraft } from "./annotation-layer";

type BoardAnnotationLayerProps = {
  camera: Camera;
  annotations: Annotation[];
  draft: AnnotationDraft | null;
  selectedAnnotationId: string | null;
  selectedAnnotationIds?: string[];
  active: boolean;
  erasing: boolean;
  onSelect: (annotationId: string, event: React.PointerEvent) => void;
  onErase: (annotationId: string) => void;
  onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
};

export function BoardAnnotationLayer({
  camera,
  annotations,
  draft,
  selectedAnnotationId,
  selectedAnnotationIds,
  active,
  erasing,
  onSelect,
  onErase,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: BoardAnnotationLayerProps) {
  const boardAnnotations = annotations.filter((annotation) => annotation.pageId === null);
  const handleShapePointerDown = (event: React.PointerEvent, annotationId: string) => {
    if (!active) return;
    event.stopPropagation();
    if (erasing) onErase(annotationId);
    else onSelect(annotationId, event);
  };

  return (
    <svg
      data-testid="whiteboard-layer"
      className="absolute inset-0 z-20 size-full overflow-hidden"
      aria-hidden="true"
      style={{ pointerEvents: active ? "auto" : "none", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
        {boardAnnotations.map((annotation) => {
          const selected = selectedAnnotationId === annotation.id || selectedAnnotationIds?.includes(annotation.id);
          if (annotation.type === "ink" || annotation.type === "highlight") return (
            <path
              key={annotation.id} data-board-annotation={annotation.id}
              d={strokeToPath(annotation.points, annotation.size, { pressureEnabled: annotation.pressureEnabled, smoothing: annotation.smoothing })}
              fill={annotation.color}
              fillOpacity={annotation.opacity}
              stroke={selected ? "#2563eb" : "transparent"}
              strokeWidth={selected ? 1.5 : Math.max(8, annotation.size)}
              strokeOpacity={selected ? 1 : 0}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => handleShapePointerDown(event, annotation.id)}
              style={{ pointerEvents: "visiblePainted" }}
            />
          );
          if (annotation.type === "text") return (
            <g key={annotation.id} data-board-annotation={annotation.id} onPointerDown={(event) => handleShapePointerDown(event, annotation.id)} style={{ pointerEvents: "all" }}>
              {selected && <rect x={annotation.x - 4} y={annotation.y - 4} width={annotation.width + 8} height={annotation.height + 8} fill="none" stroke="#2563eb" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
              <foreignObject x={annotation.x} y={annotation.y} width={annotation.width} height={annotation.height}>
                <div className="h-full overflow-hidden whitespace-pre-wrap leading-tight" style={{ color: annotation.color, opacity: annotation.opacity, fontSize: annotation.fontSize ?? 16 }}>{annotation.text}</div>
              </foreignObject>
            </g>
          );
          if (annotation.type === "rectangle") return (
            <rect
              key={annotation.id} data-board-annotation={annotation.id}
              x={annotation.x}
              y={annotation.y}
              width={annotation.width}
              height={annotation.height}
              fill={annotation.fillColor ?? "none"}
              fillOpacity={annotation.fillColor ? (annotation.fillOpacity ?? 0.12) : 0}
              stroke={selected ? "#2563eb" : annotation.color}
              strokeOpacity={annotation.opacity}
              strokeWidth={selected ? 3 : annotation.size ?? 2}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => handleShapePointerDown(event, annotation.id)}
              style={{ pointerEvents: "visiblePainted" }}
            />
          );
          return null;
        })}
        {draft?.pageId === null && (draft.type === "ink" || draft.type === "highlight") && (
          <path d={strokeToPath(draft.points, draft.size, { pressureEnabled: draft.pressureEnabled, smoothing: draft.smoothing })} fill={draft.color} fillOpacity={draft.opacity} pointerEvents="none" />
        )}
        {draft?.pageId === null && draft.type === "rectangle" && (
          <rect
            x={draft.width < 0 ? draft.x + draft.width : draft.x}
            y={draft.height < 0 ? draft.y + draft.height : draft.y}
            width={Math.abs(draft.width)}
            height={Math.abs(draft.height)}
            fill={draft.fillColor ?? "none"}
            fillOpacity={draft.fillColor ? 0.12 : 0}
            stroke={draft.color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </g>
    </svg>
  );
}
