"use client";

import { useState } from "react";
import { strokeToPath } from "@/lib/editor/annotation-path";
import type { Annotation, Point, StrokePoint } from "@/lib/editor/types";

export type AnnotationDraft =
  | { type: "ink" | "highlight"; pageId: string | null; points: StrokePoint[]; color: string; size: number; opacity: number; pressureEnabled?: boolean; smoothing?: number }
  | { type: "rectangle"; pageId: string | null; x: number; y: number; width: number; height: number; color: string; fillColor?: string };

type AnnotationLayerProps = {
  pageId: string;
  width: number;
  height: number;
  annotations: Annotation[];
  draft: AnnotationDraft | null;
  selectedAnnotationId: string | null;
  selectedAnnotationIds?: string[];
  interactive: boolean;
  erasing: boolean;
  onSelect: (annotationId: string) => void;
  onErase: (annotationId: string) => void;
  onMove: (annotationId: string, deltaX: number, deltaY: number) => void;
};

type MoveState = { annotationId: string; start: Point; current: Point };

function svgPoint(event: React.PointerEvent<SVGElement>): Point {
  const svg = event.currentTarget.ownerSVGElement;
  const matrix = svg?.getScreenCTM();
  if (!matrix) return { x: event.clientX, y: event.clientY };
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

export function AnnotationLayer({
  pageId,
  width,
  height,
  annotations,
  draft,
  selectedAnnotationId,
  selectedAnnotationIds,
  interactive,
  erasing,
  onSelect,
  onErase,
  onMove,
}: AnnotationLayerProps) {
  const [moving, setMoving] = useState<MoveState | null>(null);
  const pageAnnotations = annotations.filter((annotation) => annotation.pageId === pageId);
  const handlePointerDown = (event: React.PointerEvent<SVGElement>, annotation: Annotation) => {
    if (!interactive && !erasing) return;
    event.stopPropagation();
    if (erasing) {
      onErase(annotation.id);
      return;
    }
    onSelect(annotation.id);
    if (annotation.type === "ink" || annotation.type === "highlight") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = svgPoint(event);
    setMoving({ annotationId: annotation.id, start: point, current: point });
  };
  const handlePointerMove = (event: React.PointerEvent<SVGElement>) => {
    if (!moving || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.stopPropagation();
    setMoving({ ...moving, current: svgPoint(event) });
  };
  const finishMove = (event: React.PointerEvent<SVGElement>, commit = true) => {
    if (!moving) return;
    event.stopPropagation();
    const current = svgPoint(event);
    const deltaX = current.x - moving.start.x;
    const deltaY = current.y - moving.start.y;
    if (commit && (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5)) onMove(moving.annotationId, deltaX, deltaY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setMoving(null);
  };

  return (
    <svg
      className="absolute inset-0 size-full overflow-hidden"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ pointerEvents: interactive || erasing ? "auto" : "none" }}
    >
      {pageAnnotations.map((annotation) => {
        const selected = selectedAnnotationId === annotation.id || selectedAnnotationIds?.includes(annotation.id);
        const moveOffset = moving?.annotationId === annotation.id
          ? { x: moving.current.x - moving.start.x, y: moving.current.y - moving.start.y }
          : { x: 0, y: 0 };
        const moveHandlers = {
          onPointerMove: handlePointerMove,
          onPointerUp: (event: React.PointerEvent<SVGElement>) => finishMove(event),
          onPointerCancel: (event: React.PointerEvent<SVGElement>) => finishMove(event, false),
        };
        if (annotation.type === "ink" || annotation.type === "highlight") {
          return (
            <path
              key={annotation.id}
              d={strokeToPath(annotation.points, annotation.size, {
                pressureEnabled: annotation.pressureEnabled,
                smoothing: annotation.smoothing,
              })}
              fill={annotation.color}
              fillOpacity={annotation.opacity}
              stroke={selected ? "#2563eb" : "transparent"}
              strokeWidth={selected ? 1.5 : Math.max(8, annotation.size)}
              strokeOpacity={selected ? 1 : 0}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => handlePointerDown(event, annotation)}
              style={{ pointerEvents: "visiblePainted" }}
            />
          );
        }
        if (annotation.type === "text") {
          return (
            <g
              key={annotation.id}
              transform={`translate(${moveOffset.x} ${moveOffset.y})`}
              style={{ pointerEvents: "all", cursor: interactive ? "move" : undefined }}
            >
              {selected && (
                <rect
                  x={annotation.x - 4}
                  y={annotation.y - 4}
                  width={annotation.width + 8}
                  height={annotation.height + 8}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <foreignObject x={annotation.x} y={annotation.y} width={annotation.width} height={annotation.height}>
                <div
                  className="h-full overflow-hidden whitespace-pre-wrap leading-tight"
                  style={{
                    color: annotation.color,
                    opacity: annotation.opacity,
                    fontSize: annotation.fontSize ?? 16,
                    pointerEvents: "none",
                  }}
                >
                  {annotation.text}
                </div>
              </foreignObject>
              <rect
                x={annotation.x}
                y={annotation.y}
                width={annotation.width}
                height={annotation.height}
                fill="transparent"
                onPointerDown={(event) => handlePointerDown(event, annotation)}
                {...moveHandlers}
                style={{ pointerEvents: "all", cursor: interactive ? "move" : undefined }}
              />
            </g>
          );
        }
        if (annotation.type === "rectangle") return (
          <rect
            key={annotation.id}
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
            transform={`translate(${moveOffset.x} ${moveOffset.y})`}
            onPointerDown={(event) => handlePointerDown(event, annotation)}
            {...moveHandlers}
            style={{ pointerEvents: "visiblePainted", cursor: interactive ? "move" : undefined }}
          />
        );
        if (annotation.type === "replacement") return (
          <g
            key={annotation.id}
            transform={`translate(${moveOffset.x} ${moveOffset.y})`}
            style={{ pointerEvents: "all", cursor: interactive ? "move" : undefined }}
          >
            <rect
              x={annotation.x}
              y={annotation.y}
              width={annotation.width}
              height={annotation.height}
              fill={annotation.backgroundColor}
              stroke={selected ? "#2563eb" : "transparent"}
              strokeWidth={selected ? 1.5 : 0}
              vectorEffect="non-scaling-stroke"
            />
            <foreignObject x={annotation.x} y={annotation.y} width={annotation.width} height={annotation.height}>
              <div
                data-testid="replacement-text"
                className="h-full overflow-hidden whitespace-pre-wrap leading-tight"
                style={{ color: annotation.color, opacity: annotation.opacity, fontSize: annotation.fontSize, pointerEvents: "none" }}
              >
                {annotation.text}
              </div>
            </foreignObject>
            <rect
              x={annotation.x}
              y={annotation.y}
              width={annotation.width}
              height={annotation.height}
              fill="transparent"
              onPointerDown={(event) => handlePointerDown(event, annotation)}
              {...moveHandlers}
              style={{ pointerEvents: "all", cursor: interactive ? "move" : undefined }}
            />
          </g>
        );
        return null;
      })}
      {draft?.pageId === pageId && (draft.type === "ink" || draft.type === "highlight") && (
        <path
          d={strokeToPath(draft.points, draft.size, { pressureEnabled: draft.pressureEnabled, smoothing: draft.smoothing })}
          fill={draft.color}
          fillOpacity={draft.opacity}
          pointerEvents="none"
        />
      )}
      {draft?.pageId === pageId && draft.type === "rectangle" && (
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
    </svg>
  );
}
