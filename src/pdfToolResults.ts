import type { HighlightOperation } from './components/PdfViewer';

type PdfToolResult = Record<string, unknown>;

export type PdfToolAction =
  | { kind: 'preview-highlights'; operations: HighlightOperation[] }
  | { kind: 'split-output'; outputDir: string; fileCount: number }
  | { kind: 'folder-output'; outputDir: string; fileCount: number; label: string }
  | { kind: 'path-output'; path: string; label: string }
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

  if (
    (toolName === 'highlight_pdf_text' || toolName === 'highlight_pdf_headings' || toolName === 'apply_pdf_highlights') &&
    typeof result.output === 'string'
  ) {
    return { kind: 'file-output', path: result.output };
  }

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

  if (toolName === 'export_pdf_pages_as_images' && typeof result.output_dir === 'string') {
    return {
      kind: 'folder-output',
      outputDir: result.output_dir,
      fileCount: Array.isArray(result.files) ? result.files.length : 0,
      label: 'Open image folder',
    };
  }

  if (toolName === 'extract_pdf_images' && typeof result.output_dir === 'string') {
    return {
      kind: 'folder-output',
      outputDir: result.output_dir,
      fileCount: Array.isArray(result.images) ? result.images.length : 0,
      label: 'Open extracted images',
    };
  }

  if (toolName === 'extract_pdf_attachments' && typeof result.output_dir === 'string') {
    return {
      kind: 'folder-output',
      outputDir: result.output_dir,
      fileCount: Array.isArray(result.files) ? result.files.length : 0,
      label: 'Open attachments folder',
    };
  }

  if (toolName === 'export_pdf_text' && typeof result.output === 'string') {
    return {
      kind: 'path-output',
      path: result.output,
      label: result.format === 'text' ? 'Open text export' : 'Open Markdown export',
    };
  }

  if (!CHAT_ONLY_OUTPUT_TOOLS.has(toolName) && typeof result.output === 'string') {
    return { kind: 'file-output', path: result.output };
  }

  return null;
}

function normalizeToolResult(value: unknown): unknown {
  if (typeof value === 'string') return parseJsonString(value);
  if (isContentBlocks(value)) return parseTextBlock(value[0]);

  if (isRecord(value)) {
    if (isContentBlocks(value.content)) return parseTextBlock(value.content[0]);
    if (isContentBlocks(value.output)) return parseTextBlock(value.output[0]);
    if (isContentBlocks(value.result)) return parseTextBlock(value.result[0]);
    if (isRecord(value.result)) return normalizeToolResult(value.result);
    if (isRecord(value.data)) return normalizeToolResult(value.data);
  }

  return value;
}

function isContentBlocks(value: unknown): value is Array<{ type?: unknown; text?: unknown }> {
  return Array.isArray(value) && value.length > 0 && isRecord(value[0]) && value[0].type === 'text';
}

function parseTextBlock(block: { text?: unknown }): unknown {
  if (typeof block.text !== 'string') return block.text;
  return parseJsonString(block.text);
}

function parseJsonString(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is PdfToolResult {
  return typeof value === 'object' && value !== null;
}
