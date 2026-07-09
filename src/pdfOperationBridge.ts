import type { HighlightOperation } from './components/PdfViewer';

type BridgeMethod = (...args: string[]) => string | Promise<string>;

export interface NativePdfOperationBridge {
  getCurrentDocumentJson?: () => string | Promise<string>;
  previewOperationsJson: BridgeMethod;
  applyOperationsJson?: BridgeMethod;
  undoJson?: () => string | Promise<string>;
  redoJson?: () => string | Promise<string>;
  clearPreviewJson?: BridgeMethod;
}

interface QtWebChannelGlobal {
  pdfOperationBridge?: NativePdfOperationBridge;
  qt?: { webChannelTransport?: unknown };
  QWebChannel?: new (
    transport: unknown,
    callback: (channel: { objects?: Record<string, unknown> }) => void,
  ) => void;
  document?: Document;
}

export interface NativeHighlightPreviewResult extends NativeBridgeOperationResult {
  operationCount?: number;
  rectCount?: number;
}

export interface NativeBridgeOperationResult {
  handled: boolean;
  batchId?: string;
  outputPath?: string;
  undoAvailable?: boolean;
  redoAvailable?: boolean;
}

export interface NativeBridgeDocument {
  id: string;
  path: string;
  title: string;
  pageCount: number;
}

export interface NativeCurrentDocumentResult {
  handled: boolean;
  document?: NativeBridgeDocument | null;
}

interface BridgeOptions {
  getBridge?: () => NativePdfOperationBridge | null | Promise<NativePdfOperationBridge | null>;
}

interface PreviewOptions extends BridgeOptions {
  documentId: string;
  label?: string;
}

interface QueryPreviewOptions extends PreviewOptions {
  color?: [number, number, number];
  opacity?: number;
}

interface ApplyOptions extends BridgeOptions {
  batchId?: string;
}

interface BridgeResponse {
  ok?: boolean;
  batchId?: unknown;
  operationCount?: unknown;
  rectCount?: unknown;
  outputPath?: unknown;
  undoAvailable?: unknown;
  redoAvailable?: unknown;
  message?: unknown;
  code?: unknown;
}

interface CurrentDocumentBridgeResponse {
  document?: unknown;
}

export type NativeTextMarkupKind = 'highlight' | 'underline' | 'strikeout';

export type NativeAnnotationOperation =
  | {
      type: 'watermark';
      text: string;
      author?: string;
      opacity?: number;
    }
  | {
      type: 'redact';
      query: string;
      author?: string;
      pageIndices?: number[];
    }
  | {
      type: 'comment';
      page: number;
      x: number;
      y: number;
      text: string;
      author?: string;
      width?: number;
      height?: number;
    }
  | {
      type: 'freeText';
      page: number;
      x: number;
      y: number;
      text: string;
      author?: string;
      width?: number;
      height?: number;
    }
| {
type: 'stamp';
page: number;
x: number;
y: number;
stamp: string;
author?: string;
width?: number;
height?: number;
}
| {
type: 'imageStamp';
page: number;
x: number;
y: number;
imagePath: string;
author?: string;
width: number;
height: number;
}
| {
type: 'shape';
page: number;
x: number;
      y: number;
      kind: 'rectangle' | 'ellipse' | 'line';
      width: number;
      height: number;
      color?: [number, number, number];
      strokeWidth?: number;
      author?: string;
    };

export async function previewTextMarkupOperationsWithNativeBridge(
  kind: NativeTextMarkupKind,
  operations: HighlightOperation[],
  options: PreviewOptions,
): Promise<NativeHighlightPreviewResult> {
  const bridge = await (options.getBridge ?? getPdfOperationBridge)();
  if (!bridge) return { handled: false };

  const batch = {
    batchId: crypto.randomUUID(),
    documentId: options.documentId,
    label: options.label ?? `Agent ${kind} preview`,
    operations: operations.map((operation) => ({
      ...operation,
      type: kind,
      source: 'agent',
    })),
  };

  const response = parseBridgeResponse(await bridge.previewOperationsJson(JSON.stringify(batch)));
  rejectBridgeError(response);

  const result: NativeHighlightPreviewResult = {
    handled: true,
    batchId: typeof response.batchId === 'string' ? response.batchId : batch.batchId,
    operationCount: typeof response.operationCount === 'number' ? response.operationCount : operations.length,
    rectCount: typeof response.rectCount === 'number' ? response.rectCount : countRects(operations),
  };
  if (typeof response.undoAvailable === 'boolean') result.undoAvailable = response.undoAvailable;
  if (typeof response.redoAvailable === 'boolean') result.redoAvailable = response.redoAvailable;
  return result;
}

export async function previewHighlightOperationsWithNativeBridge(
  operations: HighlightOperation[],
  options: PreviewOptions,
): Promise<NativeHighlightPreviewResult> {
  return previewTextMarkupOperationsWithNativeBridge('highlight', operations, options);
}

export async function previewTextQueryMarkupWithNativeBridge(
  kind: NativeTextMarkupKind,
  query: string,
  options: QueryPreviewOptions,
): Promise<NativeHighlightPreviewResult> {
  const bridge = await (options.getBridge ?? getPdfOperationBridge)();
  if (!bridge) return { handled: false };

  const batch = {
    batchId: crypto.randomUUID(),
    documentId: options.documentId,
    label: options.label ?? `User ${kind} preview`,
    operations: [
      {
        id: crypto.randomUUID(),
        type: kind,
        query: query.trim(),
        color: options.color,
        opacity: options.opacity,
        source: 'user',
      },
    ],
  };

  const response = parseBridgeResponse(await bridge.previewOperationsJson(JSON.stringify(batch)));
  rejectBridgeError(response);

  const result: NativeHighlightPreviewResult = {
    handled: true,
    batchId: typeof response.batchId === 'string' ? response.batchId : batch.batchId,
    operationCount: typeof response.operationCount === 'number' ? response.operationCount : 1,
    rectCount: typeof response.rectCount === 'number' ? response.rectCount : 0,
  };
  if (typeof response.undoAvailable === 'boolean') result.undoAvailable = response.undoAvailable;
  if (typeof response.redoAvailable === 'boolean') result.redoAvailable = response.redoAvailable;
  return result;
}

export async function previewAnnotationOperationsWithNativeBridge(
  operations: NativeAnnotationOperation[],
  options: PreviewOptions,
): Promise<NativeHighlightPreviewResult> {
  const bridge = await (options.getBridge ?? getPdfOperationBridge)();
  if (!bridge) return { handled: false };

  const batch = {
    batchId: crypto.randomUUID(),
    documentId: options.documentId,
    label: options.label ?? 'User annotation preview',
    operations: operations.map((operation) => ({
      ...operation,
      source: 'user',
    })),
  };

  const response = parseBridgeResponse(await bridge.previewOperationsJson(JSON.stringify(batch)));
  rejectBridgeError(response);

  const result: NativeHighlightPreviewResult = {
    handled: true,
    batchId: typeof response.batchId === 'string' ? response.batchId : batch.batchId,
    operationCount: typeof response.operationCount === 'number' ? response.operationCount : operations.length,
    rectCount: typeof response.rectCount === 'number' ? response.rectCount : 0,
  };
  if (typeof response.undoAvailable === 'boolean') result.undoAvailable = response.undoAvailable;
  if (typeof response.redoAvailable === 'boolean') result.redoAvailable = response.redoAvailable;
  return result;
}

export async function applyOperationsWithNativeBridge(
  options: ApplyOptions = {},
): Promise<NativeBridgeOperationResult> {
  const bridge = await (options.getBridge ?? getPdfOperationBridge)();
  if (!bridge?.applyOperationsJson) return { handled: false };

  const response = parseBridgeResponse(await bridge.applyOperationsJson(options.batchId ?? ''));
  rejectBridgeError(response);

  return toOperationResult(response, options.batchId);
}

export async function clearPreviewWithNativeBridge(
  options: ApplyOptions = {},
): Promise<NativeHighlightPreviewResult> {
  const bridge = await (options.getBridge ?? getPdfOperationBridge)();
  if (!bridge?.clearPreviewJson) return { handled: false };

  const response = parseBridgeResponse(await bridge.clearPreviewJson(options.batchId ?? ''));
  rejectBridgeError(response);

  const result: NativeHighlightPreviewResult = toOperationResult(response, options.batchId);
  if (typeof response.operationCount === 'number') result.operationCount = response.operationCount;
  if (typeof response.rectCount === 'number') result.rectCount = response.rectCount;
  return result;
}

export async function getCurrentDocumentWithNativeBridge(
  options: BridgeOptions = {},
): Promise<NativeCurrentDocumentResult> {
  const bridge = await (options.getBridge ?? getPdfOperationBridge)();
  if (!bridge?.getCurrentDocumentJson) return { handled: false };

  const response = parseCurrentDocumentResponse(await bridge.getCurrentDocumentJson());
  return {
    handled: true,
    document: response.document,
  };
}

export async function undoWithNativeBridge(options: BridgeOptions = {}): Promise<NativeBridgeOperationResult> {
  const bridge = await (options.getBridge ?? getPdfOperationBridge)();
  if (!bridge?.undoJson) return { handled: false };

  const response = parseBridgeResponse(await bridge.undoJson());
  rejectBridgeError(response);

  return toOperationResult(response);
}

export async function redoWithNativeBridge(options: BridgeOptions = {}): Promise<NativeBridgeOperationResult> {
  const bridge = await (options.getBridge ?? getPdfOperationBridge)();
  if (!bridge?.redoJson) return { handled: false };

  const response = parseBridgeResponse(await bridge.redoJson());
  rejectBridgeError(response);

  return toOperationResult(response);
}

export async function getPdfOperationBridge(): Promise<NativePdfOperationBridge | null> {
  const globalObject = globalThis as QtWebChannelGlobal;
  if (isNativePdfOperationBridge(globalObject.pdfOperationBridge)) return globalObject.pdfOperationBridge;

  await loadQtWebChannelScript(globalObject);

  const transport = globalObject.qt?.webChannelTransport;
  const QWebChannelConstructor = globalObject.QWebChannel;
  if (!transport || !QWebChannelConstructor) return null;

  return new Promise((resolve) => {
    new QWebChannelConstructor(transport, (channel) => {
      const bridge = channel.objects?.pdfOperationBridge;
      if (isNativePdfOperationBridge(bridge)) {
        globalObject.pdfOperationBridge = bridge;
        resolve(bridge);
      } else {
        resolve(null);
      }
    });
  });
}

function parseBridgeResponse(rawResponse: string): BridgeResponse {
  try {
    const parsed = JSON.parse(rawResponse) as unknown;
    if (typeof parsed === 'object' && parsed !== null) return parsed as BridgeResponse;
  } catch {
    return {
      ok: false,
      code: 'invalid_response',
      message: 'PDF4QT bridge returned invalid JSON.',
    };
  }

  return {
    ok: false,
    code: 'invalid_response',
    message: 'PDF4QT bridge returned invalid response.',
  };
}

function parseCurrentDocumentResponse(rawResponse: string): { document: NativeBridgeDocument | null } {
  try {
    const parsed = JSON.parse(rawResponse) as CurrentDocumentBridgeResponse;
    const document = parsed.document;
    if (document === null || document === undefined) return { document: null };
    if (typeof document !== 'object') return { document: null };

    const candidate = document as Record<string, unknown>;
    if (
      typeof candidate.id === 'string' &&
      typeof candidate.path === 'string' &&
      typeof candidate.title === 'string' &&
      typeof candidate.pageCount === 'number'
    ) {
      return {
        document: {
          id: candidate.id,
          path: candidate.path,
          title: candidate.title,
          pageCount: candidate.pageCount,
        },
      };
    }
  } catch {
    return { document: null };
  }

  return { document: null };
}

function rejectBridgeError(response: BridgeResponse): void {
  if (response.ok === false) {
    throw new Error(
      typeof response.message === 'string'
        ? response.message
        : `PDF4QT bridge rejected ${response.code ?? 'request'}.`,
    );
  }
}

function toOperationResult(response: BridgeResponse, fallbackBatchId?: string): NativeBridgeOperationResult {
  const result: NativeBridgeOperationResult = {
    handled: true,
  };
  if (typeof response.batchId === 'string') result.batchId = response.batchId;
  else if (fallbackBatchId) result.batchId = fallbackBatchId;
  if (typeof response.outputPath === 'string') result.outputPath = response.outputPath;
  if (typeof response.undoAvailable === 'boolean') result.undoAvailable = response.undoAvailable;
  if (typeof response.redoAvailable === 'boolean') result.redoAvailable = response.redoAvailable;
  return result;
}

function countRects(operations: HighlightOperation[]): number {
  return operations.reduce((total, operation) => total + operation.rects.length, 0);
}

function isNativePdfOperationBridge(value: unknown): value is NativePdfOperationBridge {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NativePdfOperationBridge).previewOperationsJson === 'function'
  );
}

function loadQtWebChannelScript(globalObject: QtWebChannelGlobal): Promise<void> {
  const document = globalObject.document;
  if (!document || globalObject.QWebChannel) return Promise.resolve();

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'qrc:///qtwebchannel/qwebchannel.js';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}
