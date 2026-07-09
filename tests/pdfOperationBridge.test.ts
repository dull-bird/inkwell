import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyOperationsWithNativeBridge,
  clearPreviewWithNativeBridge,
  getPdfOperationBridge,
  getCurrentDocumentWithNativeBridge,
  previewAnnotationOperationsWithNativeBridge,
  previewHighlightOperationsWithNativeBridge,
  previewTextMarkupOperationsWithNativeBridge,
  previewTextQueryMarkupWithNativeBridge,
  redoWithNativeBridge,
  undoWithNativeBridge,
} from '../src/pdfOperationBridge';
import type { HighlightOperation } from '../src/components/PdfViewer';

const operations: HighlightOperation[] = [
  {
    id: 'h1',
    page: 0,
    rects: [{ x0: 10, y0: 20, x1: 90, y1: 35 }],
    color: [1, 0.9, 0],
    opacity: 0.25,
    text: 'Introduction',
  },
];

test('previews highlight operations through Qt PDF operation bridge', async () => {
  const calls: string[] = [];
  const result = await previewHighlightOperationsWithNativeBridge(operations, {
    documentId: '/tmp/paper.pdf',
    label: 'Agent highlights',
    getBridge: async () => ({
      previewOperationsJson: async (batchJson) => {
        calls.push(batchJson);
        return JSON.stringify({ ok: true, batchId: 'b1', operationCount: 1, rectCount: 1 });
      },
    }),
  });

  assert.deepEqual(result, { handled: true, operationCount: 1, rectCount: 1, batchId: 'b1' });
  assert.equal(calls.length, 1);

  const batch = JSON.parse(calls[0]);
  assert.equal(batch.documentId, '/tmp/paper.pdf');
  assert.equal(batch.label, 'Agent highlights');
  assert.equal(batch.operations[0].type, 'highlight');
  assert.equal(batch.operations[0].source, 'agent');
  assert.deepEqual(batch.operations[0].rects, operations[0].rects);
});

test('previews underline and strikeout operations through Qt PDF operation bridge', async () => {
  const calls: string[] = [];
  const result = await previewTextMarkupOperationsWithNativeBridge('underline', operations, {
    documentId: '/tmp/paper.pdf',
    label: 'Reviewer underline',
    getBridge: async () => ({
      previewOperationsJson: async (batchJson) => {
        calls.push(batchJson);
        return JSON.stringify({ ok: true, batchId: 'b2', operationCount: 1, rectCount: 1 });
      },
    }),
  });

  assert.deepEqual(result, { handled: true, operationCount: 1, rectCount: 1, batchId: 'b2' });
  assert.equal(calls.length, 1);

  const underlineBatch = JSON.parse(calls[0]);
  assert.equal(underlineBatch.documentId, '/tmp/paper.pdf');
  assert.equal(underlineBatch.label, 'Reviewer underline');
  assert.equal(underlineBatch.operations[0].type, 'underline');
  assert.equal(underlineBatch.operations[0].source, 'agent');
  assert.deepEqual(underlineBatch.operations[0].rects, operations[0].rects);

  await previewTextMarkupOperationsWithNativeBridge('strikeout', operations, {
    documentId: '/tmp/paper.pdf',
    getBridge: async () => ({
      previewOperationsJson: async (batchJson) => {
        calls.push(batchJson);
        return JSON.stringify({ ok: true, batchId: 'b3' });
      },
    }),
  });

  assert.equal(JSON.parse(calls[1]).operations[0].type, 'strikeout');
});

test('previews text query markup through Qt PDF operation bridge', async () => {
  const calls: string[] = [];
  const result = await previewTextQueryMarkupWithNativeBridge('underline', ' Risk clause ', {
    documentId: '/tmp/paper.pdf',
    label: 'Manual underline',
    color: [0.1, 0.45, 0.95],
    getBridge: async () => ({
      previewOperationsJson: async (batchJson) => {
        calls.push(batchJson);
        return JSON.stringify({ ok: true, batchId: 'b4', operationCount: 2, rectCount: 3 });
      },
    }),
  });

  assert.deepEqual(result, { handled: true, operationCount: 2, rectCount: 3, batchId: 'b4' });
  assert.equal(calls.length, 1);

  const batch = JSON.parse(calls[0]);
  assert.equal(batch.documentId, '/tmp/paper.pdf');
  assert.equal(batch.label, 'Manual underline');
  assert.equal(batch.operations[0].type, 'underline');
  assert.equal(batch.operations[0].query, 'Risk clause');
  assert.equal(batch.operations[0].source, 'user');
  assert.deepEqual(batch.operations[0].color, [0.1, 0.45, 0.95]);
});

test('previews comment free text stamp and shape annotations through Qt PDF operation bridge', async () => {
  const calls: string[] = [];
  const result = await previewAnnotationOperationsWithNativeBridge(
    [
      { type: 'comment', page: 0, x: 64, y: 120, text: 'Please confirm', author: 'Reviewer' },
      { type: 'freeText', page: 0, x: 72, y: 144, text: 'Needs review', author: 'Reviewer' },
    { type: 'stamp', page: 0, x: 120, y: 180, stamp: 'Approved', author: 'Reviewer' },
    {
      type: 'imageStamp',
      page: 0,
      x: 132,
      y: 210,
      imagePath: '/tmp/signature.png',
      width: 180,
      height: 60,
      author: 'Reviewer',
    },
      {
        type: 'shape',
        page: 0,
        x: 36,
        y: 48,
        kind: 'rectangle',
        width: 120,
        height: 60,
        color: [0.2, 0.4, 0.9],
        strokeWidth: 2,
        author: 'Reviewer',
      },
    ],
    {
      documentId: '/tmp/paper.pdf',
      label: 'Manual annotations',
      getBridge: async () => ({
        previewOperationsJson: async (batchJson) => {
          calls.push(batchJson);
          return JSON.stringify({ ok: true, batchId: 'b5', operationCount: 5, rectCount: 0 });
        },
      }),
    },
  );

  assert.deepEqual(result, { handled: true, operationCount: 5, rectCount: 0, batchId: 'b5' });
  assert.equal(calls.length, 1);

  const batch = JSON.parse(calls[0]);
  assert.equal(batch.documentId, '/tmp/paper.pdf');
  assert.equal(batch.label, 'Manual annotations');
  assert.equal(batch.operations[0].type, 'comment');
  assert.equal(batch.operations[0].text, 'Please confirm');
  assert.equal(batch.operations[1].type, 'freeText');
  assert.equal(batch.operations[1].text, 'Needs review');
  assert.equal(batch.operations[2].type, 'stamp');
  assert.equal(batch.operations[2].stamp, 'Approved');
  assert.equal(batch.operations[3].type, 'imageStamp');
  assert.equal(batch.operations[3].imagePath, '/tmp/signature.png');
  assert.equal(batch.operations[3].width, 180);
  assert.equal(batch.operations[3].height, 60);
  assert.equal(batch.operations[4].type, 'shape');
  assert.equal(batch.operations[4].kind, 'rectangle');
  assert.equal(batch.operations[4].strokeWidth, 2);
});

test('previews document watermark through Qt PDF operation bridge', async () => {
  const calls: string[] = [];
  const result = await previewAnnotationOperationsWithNativeBridge(
    [{ type: 'watermark', text: 'Internal Review', author: 'Sparrow', opacity: 0.16 }],
    {
      documentId: '/tmp/paper.pdf',
      label: 'Watermark "Internal Review" in paper.pdf',
      getBridge: async () => ({
        previewOperationsJson: async (batchJson) => {
          calls.push(batchJson);
          return JSON.stringify({ ok: true, batchId: 'wm1', operationCount: 3, rectCount: 0 });
        },
      }),
    },
  );

  assert.deepEqual(result, { handled: true, operationCount: 3, rectCount: 0, batchId: 'wm1' });
  assert.equal(calls.length, 1);
  const batch = JSON.parse(calls[0]);
  assert.equal(batch.documentId, '/tmp/paper.pdf');
  assert.equal(batch.label, 'Watermark "Internal Review" in paper.pdf');
  assert.equal(batch.operations[0].type, 'watermark');
  assert.equal(batch.operations[0].text, 'Internal Review');
  assert.equal(batch.operations[0].author, 'Sparrow');
  assert.equal(batch.operations[0].opacity, 0.16);
  assert.equal(batch.operations[0].source, 'user');
});

test('previews text redaction marks through Qt PDF operation bridge', async () => {
  const calls: string[] = [];
  const result = await previewAnnotationOperationsWithNativeBridge(
    [{ type: 'redact', query: 'SSN 123-45-6789', pageIndices: [0, 2], author: 'Sparrow' }],
    {
      documentId: '/tmp/paper.pdf',
      label: 'Redact "SSN 123-45-6789" in paper.pdf',
      getBridge: async () => ({
        previewOperationsJson: async (batchJson) => {
          calls.push(batchJson);
          return JSON.stringify({ ok: true, batchId: 'rd1', operationCount: 2, rectCount: 4 });
        },
      }),
    },
  );

  assert.deepEqual(result, { handled: true, operationCount: 2, rectCount: 4, batchId: 'rd1' });
  assert.equal(calls.length, 1);
  const batch = JSON.parse(calls[0]);
  assert.equal(batch.documentId, '/tmp/paper.pdf');
  assert.equal(batch.label, 'Redact "SSN 123-45-6789" in paper.pdf');
  assert.equal(batch.operations[0].type, 'redact');
  assert.equal(batch.operations[0].query, 'SSN 123-45-6789');
  assert.deepEqual(batch.operations[0].pageIndices, [0, 2]);
  assert.equal(batch.operations[0].author, 'Sparrow');
  assert.equal(batch.operations[0].source, 'user');
});

test('falls back when Qt PDF operation bridge is unavailable', async () => {
  const result = await previewHighlightOperationsWithNativeBridge(operations, {
    documentId: '/tmp/paper.pdf',
    getBridge: async () => null,
  });

  assert.deepEqual(result, { handled: false });
});

test('surfaces native bridge errors instead of silently using React overlay', async () => {
  await assert.rejects(
    () =>
      previewHighlightOperationsWithNativeBridge(operations, {
        documentId: '/tmp/paper.pdf',
        getBridge: async () => ({
          previewOperationsJson: async () =>
            JSON.stringify({ ok: false, code: 'invalid_request', message: 'No PDF4QT document is open.' }),
        }),
      }),
    /No PDF4QT document is open/,
  );
});

test('applies undo and redo operations through Qt PDF operation bridge', async () => {
  const calls: string[] = [];
  const bridge = {
    previewOperationsJson: async () => JSON.stringify({ ok: true }),
    applyOperationsJson: async (batchId: string) => {
      calls.push(`apply:${batchId}`);
      return JSON.stringify({ ok: true, outputPath: '/tmp/paper_applied.pdf', undoAvailable: true, redoAvailable: false });
    },
    undoJson: async () => {
      calls.push('undo');
      return JSON.stringify({ ok: true, undoAvailable: false, redoAvailable: true });
    },
    redoJson: async () => {
      calls.push('redo');
      return JSON.stringify({ ok: true, undoAvailable: true, redoAvailable: false });
    },
    clearPreviewJson: async (batchId: string) => {
      calls.push(`clear:${batchId}`);
      return JSON.stringify({ ok: true, batchId, operationCount: 1, rectCount: 1, undoAvailable: true, redoAvailable: false });
    },
  };

  assert.deepEqual(await applyOperationsWithNativeBridge({ batchId: 'b1', getBridge: async () => bridge }), {
    handled: true,
    batchId: 'b1',
    outputPath: '/tmp/paper_applied.pdf',
    undoAvailable: true,
    redoAvailable: false,
  });
  assert.deepEqual(await undoWithNativeBridge({ getBridge: async () => bridge }), {
    handled: true,
    undoAvailable: false,
    redoAvailable: true,
  });
  assert.deepEqual(await redoWithNativeBridge({ getBridge: async () => bridge }), {
    handled: true,
    undoAvailable: true,
    redoAvailable: false,
  });
  assert.deepEqual(await clearPreviewWithNativeBridge({ batchId: 'b1', getBridge: async () => bridge }), {
    handled: true,
    batchId: 'b1',
    operationCount: 1,
    rectCount: 1,
    undoAvailable: true,
    redoAvailable: false,
  });
  assert.deepEqual(calls, ['apply:b1', 'undo', 'redo', 'clear:b1']);
});

test('discovers Qt WebChannel pdfOperationBridge object', async () => {
  const globalObject = globalThis as typeof globalThis & {
    qt?: unknown;
    QWebChannel?: unknown;
    pdfOperationBridge?: unknown;
  };
  const previousQt = globalObject.qt;
  const previousQWebChannel = globalObject.QWebChannel;
  const previousBridge = globalObject.pdfOperationBridge;
  const host = { previewOperationsJson: async () => JSON.stringify({ ok: true }) };

  try {
    globalObject.pdfOperationBridge = undefined;
    globalObject.qt = { webChannelTransport: { id: 'transport' } };
    globalObject.QWebChannel = class {
      constructor(_transport: unknown, callback: (channel: { objects: Record<string, unknown> }) => void) {
        callback({ objects: { pdfOperationBridge: host } });
      }
    };

    assert.equal(await getPdfOperationBridge(), host);
  } finally {
    globalObject.qt = previousQt;
    globalObject.QWebChannel = previousQWebChannel;
    globalObject.pdfOperationBridge = previousBridge;
  }
});

test('reads current PDF4QT document through Qt PDF operation bridge', async () => {
  const result = await getCurrentDocumentWithNativeBridge({
    getBridge: async () => ({
      previewOperationsJson: async () => JSON.stringify({ ok: true }),
      getCurrentDocumentJson: async () =>
        JSON.stringify({
          document: {
            id: '/tmp/current.pdf',
            path: '/tmp/current.pdf',
            title: 'current.pdf',
            pageCount: 12,
          },
        }),
    }),
  });

  assert.deepEqual(result, {
    handled: true,
    document: {
      id: '/tmp/current.pdf',
      path: '/tmp/current.pdf',
      title: 'current.pdf',
      pageCount: 12,
    },
  });
});

test('falls back when current PDF4QT document bridge method is unavailable', async () => {
  const result = await getCurrentDocumentWithNativeBridge({
    getBridge: async () => ({
      previewOperationsJson: async () => JSON.stringify({ ok: true }),
    }),
  });

  assert.deepEqual(result, { handled: false });
});

test('App routes agent highlight previews through native bridge before legacy overlay fallback', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
  const nativePreviewIndex = appSource.indexOf('previewHighlightOperationsWithNativeBridge');
  const legacyPreviewIndex = appSource.indexOf('setHighlightsByDocument');

  assert.ok(nativePreviewIndex > -1, 'App should import and call native PDF operation bridge preview.');
  assert.ok(legacyPreviewIndex > -1, 'App should keep legacy Electron preview fallback during migration.');
  assert.ok(nativePreviewIndex < legacyPreviewIndex, 'Native PDF4QT preview should be attempted before React overlay fallback.');
});

test('App routes apply undo redo controls through native bridge before legacy fallbacks', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');

  assert.match(appSource, /applyOperationsWithNativeBridge/);
  assert.match(appSource, /clearPreviewWithNativeBridge/);
  assert.match(appSource, /undoWithNativeBridge/);
  assert.match(appSource, /redoWithNativeBridge/);
  assert.match(appSource, /nativePreviewCount/);
  assert.match(appSource, /onClearPreview/);
  assert.ok(
    appSource.indexOf('applyOperationsWithNativeBridge') < appSource.indexOf("backendPost<ApplyResponse>('/apply'"),
    'Native apply should be attempted before PyMuPDF backend apply fallback.',
  );
  assert.ok(
    appSource.indexOf('clearPreviewWithNativeBridge') < appSource.indexOf('setHighlightsByDocument'),
    'Native clear preview should be attempted before React overlay fallback.',
  );
});

test('App routes manual text markup through native query preview before backend output fallback', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
  const nativeQueryIndex = appSource.indexOf('previewTextQueryMarkupWithNativeBridge');
  const backendTextMarkupIndex = appSource.indexOf("backendPost<TextMarkupResponse>('/text-markup'");

  assert.ok(nativeQueryIndex > -1, 'App should call native query text markup preview.');
  assert.ok(backendTextMarkupIndex > -1, 'App should keep backend text markup fallback during migration.');
  assert.ok(
    nativeQueryIndex < backendTextMarkupIndex,
    'Native PDF4QT query preview should be attempted before backend text-markup output fallback.',
  );
});

test('App routes manual annotations through native preview before backend output fallback', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
  const addCommentSource = sourceBlock(appSource, 'const addComment = useCallback', 'const addFreeText = useCallback');
  const addFreeTextSource = sourceBlock(appSource, 'const addFreeText = useCallback', 'const addStamp = useCallback');
  const addStampSource = sourceBlock(appSource, 'const addStamp = useCallback', 'const addShape = useCallback');
  const addShapeSource = sourceBlock(appSource, 'const addShape = useCallback', 'const addPdfImage = useCallback');

  assertManualAnnotationNativeFirst(addCommentSource, "'/comment'");
  assertManualAnnotationNativeFirst(addFreeTextSource, "'/free-text'");
  assertManualAnnotationNativeFirst(addStampSource, "'/stamp'");
  assertManualAnnotationNativeFirst(addShapeSource, "'/shape'");
});

test('App routes image insertion through native image stamp preview before backend output fallback', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
  const addPdfImageSource = sourceBlock(appSource, 'const addPdfImage = useCallback', 'const addTextMarkup = useCallback');

  assertManualAnnotationNativeFirst(addPdfImageSource, "'/insert-image'");
  assert.match(
    addPdfImageSource,
    /type: 'imageStamp'/,
    'Inserted images should preview as image-backed Stamp annotations in PDF4QT.',
  );
});

test('App routes typed signature through native free text preview before backend output fallback', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
  const addTypedSignatureSource = sourceBlock(
    appSource,
    'const addTypedSignature = useCallback',
    'const addImageSignature = useCallback',
  );

  assertManualAnnotationNativeFirst(addTypedSignatureSource, "'/signature'");
  assert.match(
    addTypedSignatureSource,
    /type: 'freeText'/,
    'Typed signatures should preview as standard FreeText annotations in PDF4QT.',
  );
});

test('App routes image signature through native image stamp preview before backend output fallback', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
  const addImageSignatureSource = sourceBlock(
    appSource,
    'const addImageSignature = useCallback',
    'const exportNativeAgentSession = useCallback',
  );

  assertManualAnnotationNativeFirst(addImageSignatureSource, "'/image-signature'");
  assert.match(
    addImageSignatureSource,
    /type: 'imageStamp'/,
    'Image signatures should preview as image-backed Stamp annotations in PDF4QT.',
  );
});

test('App routes watermark through native PDF4QT preview before backend output fallback', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
  const addWatermarkSource = sourceBlock(appSource, 'const addWatermark = useCallback', 'const compressPdf = useCallback');

  assertManualAnnotationNativeFirst(addWatermarkSource, "'/watermark'");
  assert.match(
    addWatermarkSource,
    /type: 'watermark'/,
    'Watermarks should preview as native PDF4QT document annotations before writing a new file.',
  );
});

test('App routes text redaction through native PDF4QT mark preview before backend output fallback', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
  const redactPdfTextSource = sourceBlock(appSource, 'const redactPdfText = useCallback', 'const splitPdf = useCallback');

  assertManualAnnotationNativeFirst(redactPdfTextSource, "'/redact'");
  assert.match(
    redactPdfTextSource,
    /type: 'redact'/,
    'Text redaction should mark real PDF4QT Redact annotations before backend fallback.',
  );
  assert.match(
    redactPdfTextSource,
    /pageIndices/,
    'Native redaction preview should preserve the same page range scope as backend redaction.',
  );
});

function sourceBlock(source: string, startMarker: string, endMarker: string): string {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  assert.ok(startIndex > -1, `Missing source marker: ${startMarker}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${endMarker}`);
  return source.slice(startIndex, endIndex);
}

function assertManualAnnotationNativeFirst(source: string, backendMarker: string): void {
  const nativePreviewIndex = source.indexOf('previewAnnotationOperationsWithNativeBridge');
  const backendIndex = source.indexOf(backendMarker);

  assert.ok(nativePreviewIndex > -1, 'Manual annotation action should call native PDF operation preview.');
  assert.ok(backendIndex > -1, 'Manual annotation action should keep backend output fallback during migration.');
  assert.ok(
    nativePreviewIndex < backendIndex,
    'Native PDF4QT annotation preview should be attempted before backend output fallback.',
  );
}
