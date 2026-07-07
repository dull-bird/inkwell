export type NativePdfCommandName =
  | 'open_document'
  | 'host_status'
  | 'document_info'
  | 'find_text'
  | 'preview_highlights'
  | 'read_form_fields'
  | 'fill_form'
  | 'typed_signature'
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
    name: 'typed_signature',
    description: 'Add a visible typed signature annotation at a chosen PDF coordinate.',
    changesDocument: true,
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
