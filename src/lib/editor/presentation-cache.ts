export function presentationPreloadIndices(index: number, pageCount: number, radius = 5) {
  const start = Math.max(0, index - radius);
  const end = Math.min(pageCount - 1, index + radius);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => start + offset);
}
