import type { HighlightOperation } from './components/PdfViewer';

type PdfToolResult = Record<string, unknown>;

export type PdfToolAction =
  | { kind: 'preview-highlights'; operations: HighlightOperation[] }
  | { kind: 'split-output'; outputDir: string; fileCount: number }
  | { kind: 'file-output'; path: string };

const HIGHLIGHT_PREVIEW_TOOLS = new Set(['highlight_pdf_headings', 'find_pdf_text']);
const CHAT_ONLY_OUTPUT_TOOLS = new Set([
  'get_current_document',
  'read_pdf_text',
  'find_pdf_text',
  'highlight_pdf_headings',
  'split_pdf',
  'export_markdown_note',
]);

export function derivePdfToolAction(toolName: string, rawResult: unknown): PdfToolAction | null {
  const result = normalizeToolResult(rawResult);
  if (!isRecord(result)) return null;

  if (HIGHLIGHT_PREVIEW_TOOLS.has(toolName) && Array.isArray(result.operations)) {
    return { kind: 'preview-highlights', operations: result.operations as HighlightOperation[] };
  }

  if (toolName === 'split_pdf' && typeof result.output_dir === 'string') {
    return {
      kind: 'split-output',
      outputDir: result.output_dir,
      fileCount: Array.isArray(result.files) ? result.files.length : 0,
    };
  }

  if (!CHAT_ONLY_OUTPUT_TOOLS.has(toolName) && typeof result.output === 'string') {
    return { kind: 'file-output', path: result.output };
  }

  return null;
}

function normalizeToolResult(value: unknown): unknown {
  if (isContentBlocks(value)) return parseTextBlock(value[0]);

  if (isRecord(value)) {
    if (isContentBlocks(value.content)) return parseTextBlock(value.content[0]);
    if (isContentBlocks(value.output)) return parseTextBlock(value.output[0]);
  }

  return value;
}

function isContentBlocks(value: unknown): value is Array<{ type?: unknown; text?: unknown }> {
  return Array.isArray(value) && value.length > 0 && isRecord(value[0]) && value[0].type === 'text';
}

function parseTextBlock(block: { text?: unknown }): unknown {
  if (typeof block.text !== 'string') return block.text;
  try {
    return JSON.parse(block.text);
  } catch {
    return block.text;
  }
}

function isRecord(value: unknown): value is PdfToolResult {
  return typeof value === 'object' && value !== null;
}
