export type PdfFileAction =
  | 'watermark'
  | 'encrypt'
  | 'signature'
  | 'free-text'
  | 'stamp'
  | 'shape'
  | 'insert-image'
  | 'underline'
  | 'strikeout'
  | 'redact'
  | 'extract'
  | 'insert-blank-pages'
  | 'fill-form'
  | 'crop'
  | 'resize-pages'
  | 'set-outline'
  | 'add-attachment'
  | 'remove-attachments'
  | 'image-signature'
  | 'images-to-pdf'
  | 'html-to-pdf'
  | 'markdown-to-pdf'
  | 'compress';

export type TextMarkupKind = 'underline' | 'strikeout';

export type ShapeAnnotationKind = 'rectangle' | 'ellipse' | 'line';

export type TextExportFormat = 'markdown' | 'text';

export const SHAPE_ANNOTATION_KINDS = ['rectangle', 'ellipse', 'line'] as const;

export const TEXT_EXPORT_FORMATS = ['markdown', 'text'] as const;

export const STANDARD_STAMP_KINDS = [
  'Approved',
  'Draft',
  'Confidential',
  'Final',
  'NotApproved',
  'ForComment',
  'ForPublicRelease',
  'NotForPublicRelease',
  'TopSecret',
  'Expired',
] as const;

export type StandardStampKind = (typeof STANDARD_STAMP_KINDS)[number];

export interface WatermarkRequestBody {
  path: string;
  text: string;
}

export interface CompressRequestBody {
  path: string;
}

export interface EncryptRequestBody {
  path: string;
  user_pw: string;
  owner_pw: string;
}

export interface FillFormRequestBody {
  path: string;
  values: Record<string, string | number | boolean>;
}

export interface TypedSignatureRequestBody {
  path: string;
  page: number;
  x: number;
  y: number;
  text: string;
  signer: string;
}

export interface ImageSignatureRequestBody {
  path: string;
  page: number;
  x: number;
  y: number;
  image_path: string;
  width: number;
  height: number;
  signer: string;
}

export interface FreeTextRequestBody {
  path: string;
  page: number;
  x: number;
  y: number;
  text: string;
  author: string;
}

export interface StampRequestBody {
  path: string;
  page: number;
  x: number;
  y: number;
  stamp: StandardStampKind;
  author: string;
}

export interface ShapeDimensions {
  width: number;
  height: number;
}

export interface ShapeRequestBody {
  path: string;
  page: number;
  x: number;
  y: number;
  kind: ShapeAnnotationKind;
  width: number;
  height: number;
  color: [number, number, number];
  stroke_width: number;
  author: string;
}

export interface InsertImageRequestBody {
  path: string;
  page: number;
  x: number;
  y: number;
  image_path: string;
  width: number;
  height: number;
}

export interface TextMarkupRequestBody {
  path: string;
  query: string;
  kind: TextMarkupKind;
  color: [number, number, number];
  author: string;
}

export interface RedactRequestBody {
  path: string;
  query: string;
  page_indices?: number[];
}

export interface ExtractPagesRequestBody {
  path: string;
  page_indices: number[];
}

export interface InsertBlankPagesRequestBody {
  path: string;
  insert_index: number;
  count: number;
  width?: number;
  height?: number;
}

export interface ExportImagesRequestBody {
  path: string;
  page_indices?: number[];
  dpi: number;
}

export interface ExtractImagesRequestBody {
  path: string;
  page_indices?: number[];
}

export interface ExportTextRequestBody {
  path: string;
  format: TextExportFormat;
  page_indices?: number[];
}

export interface ImagesToPdfRequestBody {
  image_paths: string[];
  width: number;
  height: number;
  margin: number;
}

export interface HtmlToPdfRequestBody {
  html: string;
  title: string;
  width: number;
  height: number;
  margin: number;
}

export interface MarkdownToPdfRequestBody {
  markdown: string;
  title: string;
  width: number;
  height: number;
  margin: number;
}

export interface CropMargins {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CropRequestBody {
  path: string;
  margins: CropMargins;
  page_indices?: number[];
}

export interface ResizePagesRequestBody {
  path: string;
  width: number;
  height: number;
  page_indices?: number[];
}

export interface OutlineItemBody {
  level: number;
  title: string;
  page: number;
  x?: number;
  y?: number;
}

export interface SetOutlineRequestBody {
  path: string;
  outline: OutlineItemBody[];
}

export interface AddAttachmentRequestBody {
  path: string;
  file_path: string;
  name?: string;
  description: string;
}

export interface ExtractAttachmentsRequestBody {
  path: string;
  names?: string[];
}

export interface RemoveAttachmentsRequestBody {
  path: string;
  names: string[];
}

export function buildWatermarkRequest(path: string, text: string): WatermarkRequestBody {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Watermark text cannot be empty.');
  return { path, text: trimmed };
}

export function buildCompressRequest(path: string): CompressRequestBody {
  return { path };
}

export function buildEncryptRequest(path: string, password: string): EncryptRequestBody {
  const trimmed = password.trim();
  if (!trimmed) throw new Error('Password cannot be empty.');
  return { path, user_pw: trimmed, owner_pw: trimmed };
}

export function buildFillFormRequest(path: string, jsonValues: string): FillFormRequestBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonValues);
  } catch {
    throw new Error('Form values must be a valid JSON object.');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Form values must be a JSON object.');
  }
  const values: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`Form field "${key}" must be a string, number, or boolean.`);
    }
    values[key] = value;
  }
  return { path, values };
}

export function buildTypedSignatureRequest(
  path: string,
  page: number,
  x: number,
  y: number,
  text: string,
): TypedSignatureRequestBody {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Signature text cannot be empty.');
  return { path, page, x, y, text: trimmed, signer: trimmed };
}

export function buildImageSignatureRequest(
  path: string,
  page: number,
  x: number,
  y: number,
  imagePath: string,
  dimensionsText: string,
  signer = 'Sparrow',
): ImageSignatureRequestBody {
  const trimmedPath = imagePath.trim();
  if (!trimmedPath) throw new Error('Signature image path cannot be empty.');
  return {
    path,
    page,
    x,
    y,
    image_path: trimmedPath,
    ...parseDimensions(dimensionsText, 'Signature image dimensions'),
    signer: signer.trim() || 'Sparrow',
  };
}

export function buildFreeTextRequest(
  path: string,
  page: number,
  x: number,
  y: number,
  text: string,
  author = 'Sparrow',
): FreeTextRequestBody {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Free text cannot be empty.');
  return { path, page, x, y, text: trimmed, author: author.trim() || 'Sparrow' };
}

export function buildStampRequest(
  path: string,
  page: number,
  x: number,
  y: number,
  stamp: StandardStampKind,
  author = 'Sparrow',
): StampRequestBody {
  if (!STANDARD_STAMP_KINDS.includes(stamp)) throw new Error(`Unsupported stamp: ${stamp}`);
  return { path, page, x, y, stamp, author: author.trim() || 'Sparrow' };
}

export function buildShapeRequest(
  path: string,
  page: number,
  x: number,
  y: number,
  kind: ShapeAnnotationKind,
  dimensionsText: string,
  author = 'Sparrow',
): ShapeRequestBody {
  if (!SHAPE_ANNOTATION_KINDS.includes(kind)) throw new Error(`Unsupported shape: ${kind}`);
  const dimensions = parseShapeDimensions(dimensionsText);
  return {
    path,
    page,
    x,
    y,
    kind,
    width: dimensions.width,
    height: dimensions.height,
    color: [0.1, 0.45, 0.95],
    stroke_width: 2,
    author: author.trim() || 'Sparrow',
  };
}

export function buildInsertImageRequest(
  path: string,
  page: number,
  x: number,
  y: number,
  imagePath: string,
  dimensionsText: string,
): InsertImageRequestBody {
  const trimmedPath = imagePath.trim();
  if (!trimmedPath) throw new Error('Image path cannot be empty.');
  return {
    path,
    page,
    x,
    y,
    image_path: trimmedPath,
    ...parseDimensions(dimensionsText, 'Image dimensions'),
  };
}

export function buildTextMarkupRequest(
  path: string,
  query: string,
  kind: TextMarkupKind,
  author = 'Sparrow',
): TextMarkupRequestBody {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Markup text cannot be empty.');
  return {
    path,
    query: trimmed,
    kind,
    color: kind === 'underline' ? [0.1, 0.45, 0.95] : [0.85, 0.12, 0.12],
    author: author.trim() || 'Sparrow',
  };
}

export function buildRedactRequest(path: string, query: string, pageIndices?: number[]): RedactRequestBody {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Redaction text cannot be empty.');
  const request: RedactRequestBody = { path, query: trimmed };
  if (pageIndices && pageIndices.length > 0) request.page_indices = pageIndices;
  return request;
}

export function buildExtractPagesRequest(path: string, pageIndices: number[]): ExtractPagesRequestBody {
  if (pageIndices.length === 0) throw new Error('Select at least one page to extract.');
  for (const index of pageIndices) {
    if (!Number.isInteger(index) || index < 0) throw new Error('Extracted page indices must be non-negative integers.');
  }
  return { path, page_indices: pageIndices };
}

export function buildInsertBlankPagesRequest(
  path: string,
  insertAfterPageText: string,
  countText: string,
  pageCount: number,
  sizeText?: string,
): InsertBlankPagesRequestBody {
  const insertAfterPage = Number(insertAfterPageText.trim() || String(pageCount));
  if (!Number.isInteger(insertAfterPage) || insertAfterPage < 0 || insertAfterPage > pageCount) {
    throw new Error(`Insert position must be an integer from 0 to ${pageCount}.`);
  }
  const count = Number(countText.trim() || '1');
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('Blank page count must be an integer from 1 to 100.');
  }

  const request: InsertBlankPagesRequestBody = { path, insert_index: insertAfterPage, count };
  if (sizeText?.trim()) {
    const size = parsePageSize(sizeText);
    request.width = size.width;
    request.height = size.height;
  }
  return request;
}

export function buildExportImagesRequest(path: string, dpiText: string, pageIndices?: number[]): ExportImagesRequestBody {
  const dpi = Number(dpiText.trim());
  if (!Number.isInteger(dpi) || dpi < 24 || dpi > 600) {
    throw new Error('Image export DPI must be an integer between 24 and 600.');
  }
  const request: ExportImagesRequestBody = { path, dpi };
  if (pageIndices && pageIndices.length > 0) request.page_indices = pageIndices;
  return request;
}

export function buildExtractImagesRequest(path: string, pageIndices?: number[]): ExtractImagesRequestBody {
  const request: ExtractImagesRequestBody = { path };
  if (pageIndices && pageIndices.length > 0) request.page_indices = pageIndices;
  return request;
}

export function buildExportTextRequest(
  path: string,
  format: TextExportFormat,
  pageIndices?: number[],
): ExportTextRequestBody {
  if (!TEXT_EXPORT_FORMATS.includes(format)) throw new Error(`Unsupported text export format: ${format}`);
  const request: ExportTextRequestBody = { path, format };
  if (pageIndices && pageIndices.length > 0) request.page_indices = pageIndices;
  return request;
}

export function buildImagesToPdfRequest(imagePathsText: string, sizeText: string, marginText: string): ImagesToPdfRequestBody {
  const imagePaths = parsePathLines(imagePathsText);
  if (imagePaths.length === 0) throw new Error('Enter at least one image path.');
  return {
    image_paths: imagePaths,
    ...parsePageSize(sizeText),
    margin: parseNonNegativeNumber(marginText, 'Image margin'),
  };
}

export function buildHtmlToPdfRequest(html: string, title: string, sizeText: string, marginText: string): HtmlToPdfRequestBody {
  const content = html.trim();
  if (!content) throw new Error('HTML content cannot be empty.');
  return {
    html: content,
    title: title.trim() || 'Inkwell HTML Export',
    ...parsePageSize(sizeText),
    margin: parseNonNegativeNumber(marginText, 'HTML margin'),
  };
}

export function buildMarkdownToPdfRequest(
  markdown: string,
  title: string,
  sizeText: string,
  marginText: string,
): MarkdownToPdfRequestBody {
  const content = markdown.trim();
  if (!content) throw new Error('Markdown content cannot be empty.');
  return {
    markdown: content,
    title: title.trim() || 'Inkwell Markdown Export',
    ...parsePageSize(sizeText),
    margin: parseNonNegativeNumber(marginText, 'Markdown margin'),
  };
}

export function buildCropRequest(path: string, marginsText: string, pageIndices?: number[]): CropRequestBody {
  const request: CropRequestBody = { path, margins: parseCropMargins(marginsText) };
  if (pageIndices && pageIndices.length > 0) request.page_indices = pageIndices;
  return request;
}

export function buildResizePagesRequest(path: string, sizeText: string, pageIndices?: number[]): ResizePagesRequestBody {
  const request: ResizePagesRequestBody = { path, ...parsePageSize(sizeText) };
  if (pageIndices && pageIndices.length > 0) request.page_indices = pageIndices;
  return request;
}

export function buildSetOutlineRequest(path: string, outlineJson: string, pageCount: number): SetOutlineRequestBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outlineJson);
  } catch {
    throw new Error('Outline must be a valid JSON array.');
  }
  if (!Array.isArray(parsed)) throw new Error('Outline must be a JSON array.');

  let previousLevel = 0;
  const outline = parsed.map((item, index) => {
    const normalized = normalizeOutlineItem(item, index + 1);
    if (normalized.level > previousLevel + 1) {
      throw new Error('Outline levels cannot skip hierarchy levels.');
    }
    previousLevel = normalized.level;
    if (normalized.page < 1 || normalized.page > pageCount) {
      throw new Error(`Outline page must be between 1 and ${pageCount}.`);
    }
    return normalized;
  });
  return { path, outline };
}

export function buildAddAttachmentRequest(
  path: string,
  filePath: string,
  name: string,
  description = '',
): AddAttachmentRequestBody {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) throw new Error('Attachment file path cannot be empty.');
  const request: AddAttachmentRequestBody = {
    path,
    file_path: trimmedPath,
    description: description.trim(),
  };
  const trimmedName = name.trim();
  if (trimmedName) request.name = trimmedName;
  return request;
}

export function buildExtractAttachmentsRequest(path: string, namesText: string): ExtractAttachmentsRequestBody {
  const names = parseAttachmentNames(namesText);
  const request: ExtractAttachmentsRequestBody = { path };
  if (names.length > 0) request.names = names;
  return request;
}

export function buildRemoveAttachmentsRequest(path: string, namesText: string): RemoveAttachmentsRequestBody {
  const names = parseAttachmentNames(namesText);
  if (names.length === 0) throw new Error('Enter at least one attachment name.');
  return { path, names };
}

export function parseAttachmentNames(input: string): string[] {
  return parsePathLines(input);
}

export function parsePathLines(input: string): string[] {
  return input
    .split(/[,\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function parseNonNegativeNumber(input: string, label: string): number {
  const value = Number(input.trim());
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number.`);
  return value;
}

export function parsePageSize(input: string): { width: number; height: number } {
  const values = input
    .trim()
    .split(/[,\sx×]+/i)
    .filter(Boolean)
    .map((value) => Number(value));
  if (values.length !== 2 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Page size must be two positive numbers: width, height.');
  }
  return { width: values[0], height: values[1] };
}

export function parseCropMargins(input: string): CropMargins {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Crop margins cannot be empty.');

  const values = trimmed
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Crop margins must be non-negative numbers.');
  }
  if (values.length === 1) {
    const margin = values[0];
    return { left: margin, top: margin, right: margin, bottom: margin };
  }
  if (values.length === 4) {
    const [left, top, right, bottom] = values;
    return { left, top, right, bottom };
  }
  throw new Error('Crop margins must be one number or four numbers: left, top, right, bottom.');
}

export function parseShapeDimensions(input: string): ShapeDimensions {
  return parseDimensions(input, 'Shape dimensions');
}

export function parseDimensions(input: string, label: string): ShapeDimensions {
  const trimmed = input.trim();
  if (!trimmed) throw new Error(`${label} cannot be empty.`);
  const values = trimmed
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error(`${label} must be positive numbers.`);
  }
  if (values.length === 1) return { width: values[0], height: values[0] };
  if (values.length === 2) return { width: values[0], height: values[1] };
  throw new Error(`${label} must be one number or two numbers: width, height.`);
}

function normalizeOutlineItem(item: unknown, lineNumber: number): OutlineItemBody {
  let level: unknown;
  let title: unknown;
  let page: unknown;
  let x: unknown;
  let y: unknown;

  if (Array.isArray(item)) {
    [level, title, page] = item;
  } else if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    level = record.level;
    title = record.title;
    page = record.page;
    x = record.x;
    y = record.y;
  } else {
    throw new Error(`Outline item ${lineNumber} must be an object or [level, title, page] array.`);
  }

  const normalizedLevel = Number(level);
  const normalizedPage = Number(page);
  if (!Number.isInteger(normalizedLevel) || normalizedLevel < 1) {
    throw new Error(`Outline item ${lineNumber} level must be a positive integer.`);
  }
  if (typeof title !== 'string' || !title.trim()) {
    throw new Error(`Outline item ${lineNumber} title cannot be empty.`);
  }
  if (!Number.isInteger(normalizedPage)) {
    throw new Error(`Outline item ${lineNumber} page must be an integer.`);
  }

  const result: OutlineItemBody = {
    level: normalizedLevel,
    title: title.trim(),
    page: normalizedPage,
  };
  if (x !== undefined || y !== undefined) {
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Outline item ${lineNumber} x and y must be finite numbers when provided.`);
    }
    result.x = x;
    result.y = y;
  }
  return result;
}

export function describeFileOutput(action: PdfFileAction, outputPath: string): string {
  const name = fileName(outputPath);
  if (action === 'encrypt') {
    return `已加密输出 ${name}。加密文件不会自动打开，请用系统 PDF 阅读器验证密码。`;
  }
  if (action === 'signature') return `已签名并打开 ${name}`;
  if (action === 'free-text') return `已添加可见文本并打开 ${name}`;
  if (action === 'stamp') return `已添加印章并打开 ${name}`;
  if (action === 'shape') return `已添加形状标注并打开 ${name}`;
  if (action === 'insert-image') return `已插入图片并打开 ${name}`;
  if (action === 'underline') return `已添加下划线并打开 ${name}`;
  if (action === 'strikeout') return `已添加删除线并打开 ${name}`;
  if (action === 'redact') return `已涂黑并移除文本，已打开 ${name}`;
  if (action === 'extract') return `已提取页面并打开 ${name}`;
  if (action === 'insert-blank-pages') return `已插入空白页并打开 ${name}`;
  if (action === 'fill-form') return `已填写表单并打开 ${name}`;
  if (action === 'crop') return `已裁剪页面并打开 ${name}`;
  if (action === 'resize-pages') return `已调整页面尺寸并打开 ${name}`;
  if (action === 'set-outline') return `已更新书签并打开 ${name}`;
  if (action === 'add-attachment') return `已添加附件并打开 ${name}`;
  if (action === 'remove-attachments') return `已移除附件并打开 ${name}`;
  if (action === 'image-signature') return `已添加图片签名并打开 ${name}`;
  if (action === 'images-to-pdf') return `已将图片转换为 PDF 并打开 ${name}`;
  if (action === 'html-to-pdf') return `已将 HTML 转换为 PDF 并打开 ${name}`;
  if (action === 'markdown-to-pdf') return `已将 Markdown 转换为 PDF 并打开 ${name}`;
  if (action === 'compress') return `已压缩并打开 ${name}`;
  return `已保存并打开 ${name}`;
}

export function describeCompressionOutput(outputPath: string, savedBytes?: number, savedPercent?: number): string {
  const base = describeFileOutput('compress', outputPath);
  if (typeof savedBytes !== 'number' || typeof savedPercent !== 'number') return base;
  const sign = savedBytes >= 0 ? '减少' : '增加';
  return `${base} 文件大小${sign} ${formatBytes(Math.abs(savedBytes))}（${Math.abs(savedPercent).toFixed(2)}%）。`;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(1)} MiB`;
}
