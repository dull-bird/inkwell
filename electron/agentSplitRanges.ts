import { z } from 'zod';

export const splitPdfPageRangesSchema = z.array(
  z.object({
    start: z.number().int().min(1).describe('1-based inclusive start page.'),
    end: z.number().int().min(1).describe('1-based inclusive end page.'),
  }),
);

export type AgentSplitPageRanges = z.infer<typeof splitPdfPageRangesSchema>;

export function normalizeAgentPageRanges(ranges: AgentSplitPageRanges | undefined): Array<[number, number]> | undefined {
  if (!ranges) return undefined;
  return ranges.map(({ start, end }) => {
    if (start > end) throw new Error(`Invalid page range: start must be <= end (${start}-${end}).`);
    return [start, end];
  });
}
