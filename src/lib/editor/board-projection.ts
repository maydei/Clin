import type { Annotation, EditorPage, Point, StrokePoint } from "./types";

function worldToPage(point: Point, page: EditorPage): Point {
  const centerX = page.x + page.width / 2;
  const centerY = page.y + page.height / 2;
  const angle = (-page.rotation * Math.PI) / 180;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle) + page.width / 2,
    y: dx * Math.sin(angle) + dy * Math.cos(angle) + page.height / 2,
  };
}

function intersectsPage(left: number, top: number, right: number, bottom: number, page: EditorPage) {
  return right >= 0 && bottom >= 0 && left <= page.width && top <= page.height;
}

export function boardAnnotationsForPage(annotations: Annotation[], page: EditorPage): Annotation[] {
  return annotations.reduce<Annotation[]>((projected, annotation) => {
    if (annotation.pageId !== null || annotation.type === "replacement") return projected;
    const id = `board-${annotation.id}-${page.id}`;
    if (annotation.type === "ink" || annotation.type === "highlight") {
      const points = annotation.points.map(([x, y, pressure]) => {
        const local = worldToPage({ x, y }, page);
        return [local.x, local.y, pressure] as StrokePoint;
      });
      if (!points.length) return projected;
      const padding = annotation.size / 2;
      const left = Math.min(...points.map((point) => point[0])) - padding;
      const top = Math.min(...points.map((point) => point[1])) - padding;
      const right = Math.max(...points.map((point) => point[0])) + padding;
      const bottom = Math.max(...points.map((point) => point[1])) + padding;
      if (intersectsPage(left, top, right, bottom, page)) projected.push({ ...annotation, id, pageId: page.id, points });
      return projected;
    }
    if (annotation.type !== "text" && annotation.type !== "rectangle") return projected;

    const corners = [
      worldToPage({ x: annotation.x, y: annotation.y }, page),
      worldToPage({ x: annotation.x + annotation.width, y: annotation.y }, page),
      worldToPage({ x: annotation.x, y: annotation.y + annotation.height }, page),
      worldToPage({ x: annotation.x + annotation.width, y: annotation.y + annotation.height }, page),
    ];
    const left = Math.min(...corners.map((point) => point.x));
    const top = Math.min(...corners.map((point) => point.y));
    const right = Math.max(...corners.map((point) => point.x));
    const bottom = Math.max(...corners.map((point) => point.y));
    if (intersectsPage(left, top, right, bottom, page)) projected.push({ ...annotation, id, pageId: page.id, x: left, y: top, width: right - left, height: bottom - top });
    return projected;
  }, []);
}
