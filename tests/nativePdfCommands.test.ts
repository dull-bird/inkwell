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
      'free_text_annotation',
      'stamp_annotation',
      'shape_annotation',
      'insert_image',
      'underline_text',
      'strikeout_text',
      'redact_text',
      'typed_signature',
      'image_signature',
      'extract_pages',
      'insert_blank_pages',
      'export_pages_as_images',
      'extract_images',
      'export_text',
      'images_to_pdf',
      'html_to_pdf',
      'markdown_to_pdf',
      'crop_pages',
      'resize_pages',
      'read_outline',
      'set_outline',
      'list_attachments',
      'add_attachment',
      'extract_attachments',
      'remove_attachments',
      'compress_pdf',
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
  assert.equal(nativePdfCommandChangesDocument('free_text_annotation'), true);
  assert.equal(nativePdfCommandChangesDocument('stamp_annotation'), true);
  assert.equal(nativePdfCommandChangesDocument('shape_annotation'), true);
  assert.equal(nativePdfCommandChangesDocument('insert_image'), true);
  assert.equal(nativePdfCommandChangesDocument('underline_text'), true);
  assert.equal(nativePdfCommandChangesDocument('strikeout_text'), true);
  assert.equal(nativePdfCommandChangesDocument('redact_text'), true);
  assert.equal(nativePdfCommandChangesDocument('typed_signature'), true);
  assert.equal(nativePdfCommandChangesDocument('image_signature'), true);
  assert.equal(nativePdfCommandChangesDocument('extract_pages'), false);
  assert.equal(nativePdfCommandChangesDocument('insert_blank_pages'), true);
  assert.equal(nativePdfCommandChangesDocument('export_pages_as_images'), false);
  assert.equal(nativePdfCommandChangesDocument('extract_images'), false);
  assert.equal(nativePdfCommandChangesDocument('export_text'), false);
  assert.equal(nativePdfCommandChangesDocument('images_to_pdf'), false);
  assert.equal(nativePdfCommandChangesDocument('html_to_pdf'), false);
  assert.equal(nativePdfCommandChangesDocument('markdown_to_pdf'), false);
  assert.equal(nativePdfCommandChangesDocument('crop_pages'), true);
  assert.equal(nativePdfCommandChangesDocument('resize_pages'), true);
  assert.equal(nativePdfCommandChangesDocument('read_outline'), false);
  assert.equal(nativePdfCommandChangesDocument('set_outline'), true);
  assert.equal(nativePdfCommandChangesDocument('list_attachments'), false);
  assert.equal(nativePdfCommandChangesDocument('add_attachment'), true);
  assert.equal(nativePdfCommandChangesDocument('extract_attachments'), false);
  assert.equal(nativePdfCommandChangesDocument('remove_attachments'), true);
  assert.equal(nativePdfCommandChangesDocument('compress_pdf'), false);
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
