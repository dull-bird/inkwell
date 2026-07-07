export type PageRange = [number, number];

export function parsePageRanges(input: string): PageRange[] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  return trimmed.split(',').map((part) => parsePageRangePart(part.trim()));
}

function parsePageRangePart(part: string): PageRange {
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
  if (!match) throw new Error(`Invalid page range: ${part}`);

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  if (start < 1 || end < 1) throw new Error('Page numbers start at 1.');
  if (end < start) throw new Error(`Invalid page range: ${part}`);

  return [start, end];
}
