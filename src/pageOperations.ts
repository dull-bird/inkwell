export type PageRange = [number, number];

export function buildRemainingPageOrder(pageCount: number, deleteRanges: PageRange[]): number[] {
  const deleted = new Set(expandPageRanges(pageCount, deleteRanges));
  const remaining = Array.from({ length: pageCount }, (_, index) => index).filter((index) => !deleted.has(index));
  if (remaining.length === 0) throw new Error('Cannot delete every page.');
  return remaining;
}

export function buildRotationMap(pageCount: number, pageRanges: PageRange[], degrees: number): Record<number, number> {
  const selected = expandPageRanges(pageCount, pageRanges);
  return Object.fromEntries(selected.map((index) => [index, normalizeDegrees(degrees)]));
}

export function expandPageRanges(pageCount: number, pageRanges: PageRange[]): number[] {
  const selected = new Set<number>();
  for (const [start, end] of pageRanges) {
    if (start < 1 || end < start || end > pageCount) {
      throw new Error(`Invalid page range ${start}-${end} for ${pageCount} pages.`);
    }
    for (let page = start; page <= end; page += 1) {
      selected.add(page - 1);
    }
  }
  return Array.from(selected);
}

function normalizeDegrees(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(normalized)) throw new Error('Rotation must be 0, 90, 180, or 270 degrees.');
  return normalized;
}
