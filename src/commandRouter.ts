export type LocalPdfCommand =
  | { kind: 'empty' }
  | { kind: 'agent' }
  | { kind: 'highlight-headings' }
  | { kind: 'highlight-text'; query: string };

const HEADING_WORDS = ['标题', 'heading', 'headings', 'title', 'titles'];
const HIGHLIGHT_WORDS = ['高亮', 'highlight'];

export function routeLocalPdfCommand(input: string): LocalPdfCommand {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };

  const normalized = trimmed.toLowerCase();
  if (includesAny(normalized, HIGHLIGHT_WORDS) && includesAny(normalized, HEADING_WORDS)) return { kind: 'agent' };

  const query = extractHighlightQuery(trimmed);
  if (query) return { kind: 'highlight-text', query };

  return { kind: 'agent' };
}

function extractHighlightQuery(input: string): string | null {
  const quoted = /[「"']([^」"']+)[」"']/.exec(input);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const chinese = /(?:请)?(?:帮我)?高亮\s*(.+)$/i.exec(input);
  if (chinese?.[1]?.trim()) return cleanQuery(chinese[1]);

  const english = /^highlight\s+(.+)$/i.exec(input);
  if (english?.[1]?.trim()) return cleanQuery(english[1]);

  return null;
}

function cleanQuery(query: string): string {
  return query.replace(/[。.!?？]+$/g, '').trim();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}
