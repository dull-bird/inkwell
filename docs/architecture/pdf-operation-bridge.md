# PdfOperationBridge

`PdfOperationBridge` is the boundary between the agent panel and the PDF host.
The agent panel should not mutate PDF files directly. It emits structured PDF
operation requests; the host previews them in the current viewer and owns
undo/redo/save behavior.

## Types

```ts
export interface CurrentPdfDocument {
  id: string;
  path: string;
  title: string;
  pageCount: number;
}

export type PdfOperation =
  | PdfHighlightOperation
  | PdfTextNoteOperation
  | PdfRedactionPreviewOperation;

export interface PdfRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfHighlightOperation {
  type: 'highlight';
  page: number;
  rects: PdfRect[];
  color: [number, number, number];
  opacity: number;
  text?: string;
  source?: 'agent' | 'manual';
}

export interface PdfTextNoteOperation {
  type: 'text-note';
  page: number;
  rect: PdfRect;
  text: string;
  color?: [number, number, number];
  source?: 'agent' | 'manual';
}

export interface PdfRedactionPreviewOperation {
  type: 'redaction-preview';
  page: number;
  rects: PdfRect[];
  source?: 'agent' | 'manual';
}

export interface PdfOperationBatch {
  batchId?: string;
  documentId: string;
  label: string;
  operations: PdfOperation[];
}

export interface PdfOperationPreviewResult {
  batchId: string;
  operationCount: number;
  undoAvailable: boolean;
  redoAvailable: boolean;
}

export interface PdfApplyResult {
  outputPath: string;
  operationCount: number;
}

export interface PdfUndoRedoState {
  undoAvailable: boolean;
  redoAvailable: boolean;
}

export interface PdfOperationBridge {
  getCurrentDocument(): Promise<CurrentPdfDocument | null>;
  previewOperations(batch: PdfOperationBatch): Promise<PdfOperationPreviewResult>;
  applyOperations(batchId: string): Promise<PdfApplyResult>;
  undo(): Promise<PdfUndoRedoState>;
  redo(): Promise<PdfUndoRedoState>;
  clearPreview(batchId?: string): Promise<void>;
}
```

## Rules

- Preview operations must update the current PDF view immediately.
- Preview operations must enter the same undo stack as manual edits.
- Preview operations must not write the source PDF.
- Apply operations must write to an explicit output path or sibling copy.
- Agent tools should return operation batches, not write files by default.
- The user must explicitly ask to save/apply/export before the agent panel calls
  `applyOperations`.

## Event Flow

```text
User prompt
  -> ACP agent
  -> tool result with PdfOperationBatch
  -> agent panel calls PdfOperationBridge.previewOperations
  -> PDF4QT host updates viewer and undo stack
  -> chat card shows "Previewed N operations"
  -> user clicks Apply or says save
  -> agent panel calls PdfOperationBridge.applyOperations
  -> PDF4QT host writes a sibling output PDF
```
