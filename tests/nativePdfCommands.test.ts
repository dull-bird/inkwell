import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_PDF_COMMANDS,
  assertSafeNativePdfSaveTarget,
  getNativePdfCommandSpec,
  nativePdfCommandChangesDocument,
} from '../shared/native-pdf-commands';

test('defines the first PDF4QT host command surface', () => {
  assert.deepEqual(
    NATIVE_PDF_COMMANDS.map((command) => command.name),
    [
      'open_document',
      'host_status',
      'document_info',
      'find_text',
      'preview_highlights',
      'read_form_fields',
      'fill_form',
      'typed_signature',
      'apply_operations',
      'undo',
      'redo',
      'save_as',
    ],
  );
});

test('distinguishes read-only commands from mutating commands', () => {
  assert.equal(nativePdfCommandChangesDocument('document_info'), false);
  assert.equal(nativePdfCommandChangesDocument('host_status'), false);
  assert.equal(nativePdfCommandChangesDocument('find_text'), false);
  assert.equal(nativePdfCommandChangesDocument('preview_highlights'), false);
  assert.equal(nativePdfCommandChangesDocument('read_form_fields'), false);
  assert.equal(nativePdfCommandChangesDocument('fill_form'), true);
  assert.equal(nativePdfCommandChangesDocument('typed_signature'), true);
  assert.equal(nativePdfCommandChangesDocument('apply_operations'), true);
  assert.equal(nativePdfCommandChangesDocument('undo'), true);
  assert.equal(nativePdfCommandChangesDocument('redo'), true);
  assert.equal(nativePdfCommandChangesDocument('save_as'), false);
});

test('keeps native command specs explicit and small', () => {
  const apply = getNativePdfCommandSpec('apply_operations');

  assert.equal(apply.transport, 'json-rpc');
  assert.match(apply.description, /operation stack/);
});

test('rejects saving native output over the source PDF', () => {
  assert.throws(
    () => assertSafeNativePdfSaveTarget('/work/file.pdf', '/work/file.pdf'),
    /must not overwrite source PDF/,
  );
  assert.equal(assertSafeNativePdfSaveTarget('/work/file.pdf', '/work/file_applied.pdf'), undefined);
});
