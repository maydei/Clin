import type { TextMatch } from "@/lib/editor/text-index";

export function SearchHighlights({ matches, activeId, testId = "search-target" }: { matches: TextMatch[]; activeId?: string | null; testId?: string }) {
  return matches.flatMap((match) => match.rects.map((rect, index) => (
    <div key={`${match.id}-${index}`} data-testid={testId} data-active={match.id === activeId} className="search-highlight pointer-events-none absolute z-40" style={{ left: rect.x, top: rect.y, width: Math.max(1, rect.width), height: Math.max(1, rect.height) }} />
  )));
}
