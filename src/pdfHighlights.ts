export interface PdfHighlightLike {
  rects?: unknown;
}

export function countHighlightRects(highlights: PdfHighlightLike[]): number {
  return highlights.reduce((total, highlight) => {
    if (!Array.isArray(highlight.rects)) return total;
    return total + highlight.rects.length;
  }, 0);
}
