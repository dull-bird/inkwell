import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');

test('exposes page organization controls for blank pages and resizing', () => {
  assert.match(appSource, /blankPageInsertAfter/);
  assert.match(appSource, /blankPageCount/);
  assert.match(appSource, /pageSizeText/);
  assert.match(appSource, /onInsertBlankPages/);
  assert.match(appSource, /onResizePages/);
  assert.match(appSource, />\s*Blank\s*</);
  assert.match(appSource, />\s*Resize\s*</);
});

test('exposes outline and attachment organization controls', () => {
  assert.match(appSource, /outlineJson/);
  assert.match(appSource, /attachmentFilePath/);
  assert.match(appSource, /attachmentNames/);
  assert.match(appSource, /onReadOutline/);
  assert.match(appSource, /onSetOutline/);
  assert.match(appSource, /onListAttachments/);
  assert.match(appSource, /onAddAttachment/);
  assert.match(appSource, /onExtractAttachments/);
  assert.match(appSource, /onRemoveAttachments/);
  assert.match(appSource, />\s*Read outline\s*</);
  assert.match(appSource, />\s*Save outline\s*</);
  assert.match(appSource, />\s*Attach\s*</);
  assert.match(appSource, />\s*Extract files\s*</);
});

test('exposes format conversion controls', () => {
  assert.match(appSource, /conversionImagePaths/);
  assert.match(appSource, /conversionHtml/);
  assert.match(appSource, /conversionMarkdown/);
  assert.match(appSource, /onConvertImagesToPdf/);
  assert.match(appSource, /onConvertHtmlToPdf/);
  assert.match(appSource, /onConvertMarkdownToPdf/);
  assert.match(appSource, />\s*Images to PDF\s*</);
  assert.match(appSource, />\s*HTML to PDF\s*</);
  assert.match(appSource, />\s*Markdown to PDF\s*</);
});

test('exposes image insertion and image signature controls', () => {
  assert.match(appSource, /imageFilePath/);
  assert.match(appSource, /imageDimensions/);
  assert.match(appSource, /signatureImagePath/);
  assert.match(appSource, /signatureImageDimensions/);
  assert.match(appSource, /onAddPdfImage/);
  assert.match(appSource, /onAddImageSignature/);
  assert.match(appSource, />\s*Image\s*</);
  assert.match(appSource, />\s*Image sign\s*</);
});
