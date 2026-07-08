const DEFAULT_TOOL_MARKER = 'acp-ai-sdk-tools__';
const KNOWN_INKWELL_TOOLS = new Set([
  'find_pdf_text',
  'highlight_pdf_headings',
  'highlight_pdf_text',
  'apply_pdf_highlights',
  'split_pdf',
  'export_pdf_pages_as_images',
  'extract_pdf_images',
  'extract_pdf_attachments',
  'export_pdf_text',
  'read_pdf_text',
  'get_current_document',
  'add_pdf_comment',
  'add_pdf_free_text',
  'add_pdf_stamp',
  'add_pdf_shape',
  'insert_pdf_image',
  'underline_pdf_text',
  'strikeout_pdf_text',
  'redact_pdf_text',
  'extract_pdf_pages',
  'insert_blank_pdf_pages',
  'resize_pdf_pages',
  'crop_pdf_pages',
  'set_pdf_outline',
  'add_pdf_attachment',
  'remove_pdf_attachments',
  'create_pdf_from_images',
  'convert_html_to_pdf',
  'convert_markdown_to_pdf',
  'add_image_signature',
  'compress_pdf',
]);

export interface InkwellToolEvent {
  toolCallId: string;
  toolName: string;
  args: unknown;
  output: unknown;
}

export function extractInkwellToolEvent(
  part: unknown,
  marker = DEFAULT_TOOL_MARKER,
): InkwellToolEvent | null {
  if (!isRecord(part)) return null;

  const input = isRecord(part.input) ? part.input : null;
  const realName = firstString(input?.toolName, part.toolName, part.name);
  if (!realName) return null;

  const toolName = normalizeInkwellToolName(realName, marker);
  if (!toolName) return null;

  const toolCallId = firstString(part.toolCallId, part.id);
  if (!toolCallId) return null;

  return {
    toolCallId,
    toolName,
    args: input?.args ?? input?.arguments ?? part.args,
    output: part.output ?? part.result,
  };
}

export function normalizeInkwellToolName(realName: string, marker = DEFAULT_TOOL_MARKER): string | null {
  const markerIndex = realName.indexOf(marker);
  if (markerIndex !== -1) return realName.slice(markerIndex + marker.length);
  return KNOWN_INKWELL_TOOLS.has(realName) ? realName : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
