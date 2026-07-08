export type NativePdfCommandName =
  | 'open_document'
  | 'host_status'
  | 'document_info'
  | 'find_text'
  | 'preview_highlights'
  | 'read_form_fields'
  | 'fill_form'
  | 'free_text_annotation'
  | 'stamp_annotation'
  | 'shape_annotation'
  | 'insert_image'
  | 'underline_text'
  | 'strikeout_text'
  | 'redact_text'
  | 'typed_signature'
  | 'image_signature'
  | 'extract_pages'
  | 'insert_blank_pages'
  | 'export_pages_as_images'
  | 'extract_images'
  | 'export_text'
  | 'images_to_pdf'
  | 'html_to_pdf'
  | 'markdown_to_pdf'
  | 'crop_pages'
  | 'resize_pages'
  | 'read_outline'
  | 'set_outline'
  | 'list_attachments'
  | 'add_attachment'
  | 'extract_attachments'
  | 'remove_attachments'
  | 'compress_pdf'
  | 'apply_operations'
  | 'undo'
  | 'redo'
  | 'save_as';

export interface NativePdfCommandSpec {
  name: NativePdfCommandName;
  description: string;
  changesDocument: boolean;
  transport: 'json-rpc';
}

export const NATIVE_PDF_COMMANDS: NativePdfCommandSpec[] = [
  {
    name: 'open_document',
    description: 'Open a PDF in the native host without mutating it.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'host_status',
    description: 'Return native host protocol version and whether the PDF4QT adapter is linked.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'document_info',
    description: 'Return page count, page sizes, metadata, outlines, forms, and signature summary.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'find_text',
    description: 'Find text and return page rectangles suitable for preview overlays.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'preview_highlights',
    description: 'Create undoable preview highlight operations without writing a PDF file.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'read_form_fields',
    description: 'Read fillable AcroForm fields with type, value, page, and rectangle metadata.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'fill_form',
    description: 'Set fillable form field values by name and update the native operation stack.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'free_text_annotation',
    description: 'Add a visible free text annotation at a chosen PDF coordinate.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'stamp_annotation',
    description: 'Add a standard stamp annotation at a chosen PDF coordinate.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'shape_annotation',
    description: 'Add a standard rectangle, ellipse, or line annotation at a chosen PDF coordinate.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'insert_image',
    description: 'Insert a local image file as visible PDF page content.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'underline_text',
    description: 'Add standard underline annotations for exact text matches.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'strikeout_text',
    description: 'Add standard strikeout annotations for exact text matches.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'redact_text',
    description: 'Apply permanent redactions for exact text matches and update the native operation stack.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'typed_signature',
    description: 'Add a visible typed signature annotation at a chosen PDF coordinate.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'image_signature',
    description: 'Add a visible image signature from a local image file.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'extract_pages',
    description: 'Write selected pages to a new PDF without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'insert_blank_pages',
    description: 'Insert blank pages and update the native operation stack.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'export_pages_as_images',
    description: 'Render selected pages to PNG images without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'extract_images',
    description: 'Extract embedded image streams without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'export_text',
    description: 'Export selected pages as Markdown or plain text without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'images_to_pdf',
    description: 'Create a new PDF from local image files without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'html_to_pdf',
    description: 'Create a new PDF from HTML content without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'markdown_to_pdf',
    description: 'Create a new PDF from Markdown content without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'crop_pages',
    description: 'Crop selected pages by margins and update the native operation stack.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'resize_pages',
    description: 'Resize selected pages and update the native operation stack.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'read_outline',
    description: 'Read PDF outline/bookmark entries without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'set_outline',
    description: 'Replace PDF outline/bookmark entries and update the native operation stack.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'list_attachments',
    description: 'List embedded PDF file attachments without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'add_attachment',
    description: 'Embed a local file attachment and update the native operation stack.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'extract_attachments',
    description: 'Extract embedded PDF file attachments without changing the current native document.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'remove_attachments',
    description: 'Remove embedded PDF file attachments and update the native operation stack.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'compress_pdf',
    description: 'Write an optimized PDF copy without changing the native edit stack.',
    changesDocument: false,
    transport: 'json-rpc',
  },
  {
    name: 'apply_operations',
    description: 'Apply the current operation stack to the native document and update undo/redo state.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'undo',
    description: 'Undo the latest native document operation.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'redo',
    description: 'Redo the latest native document operation.',
    changesDocument: true,
    transport: 'json-rpc',
  },
  {
    name: 'save_as',
    description: 'Write the current native document to an explicit output path.',
    changesDocument: false,
    transport: 'json-rpc',
  },
];

export function getNativePdfCommandSpec(name: NativePdfCommandName): NativePdfCommandSpec {
  const spec = NATIVE_PDF_COMMANDS.find((command) => command.name === name);
  if (!spec) throw new Error(`Unknown native PDF command: ${name}`);
  return spec;
}

export function nativePdfCommandChangesDocument(name: NativePdfCommandName): boolean {
  return getNativePdfCommandSpec(name).changesDocument;
}

export function assertSafeNativePdfSaveTarget(sourcePath: string, outputPath: string): void {
  if (normalizePath(sourcePath) === normalizePath(outputPath)) {
    throw new Error('Native PDF save_as must not overwrite source PDF.');
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}
