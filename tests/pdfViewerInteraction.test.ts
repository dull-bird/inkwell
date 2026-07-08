import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pdfViewerSource = readFileSync(resolve('src/components/PdfViewer.tsx'), 'utf8');
const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');

test('captures PDF page clicks only while a placement tool is active', () => {
  assert.match(pdfViewerSource, /targetMode = 'none'/);
  assert.match(pdfViewerSource, /const pickingTarget = isPdfPlacementActive\(targetMode\)/);
  assert.match(pdfViewerSource, /if \(!pickingTarget\) return;/);
  assert.match(pdfViewerSource, /picking-target/);
});

test('annotation tools enter placement mode instead of requiring stray page clicks', () => {
  assert.match(appSource, /beginPlacement\('comment'\)/);
  assert.match(appSource, /beginPlacement\('free-text'\)/);
  assert.match(appSource, /beginPlacement\('stamp'\)/);
  assert.match(appSource, /beginPlacement\('shape'\)/);
  assert.match(appSource, /beginPlacement\('image'\)/);
  assert.match(appSource, /beginPlacement\('signature'\)/);
  assert.match(appSource, /beginPlacement\('image-signature'\)/);
  assert.match(appSource, /targetMode=\{placementMode\}/);
  assert.match(appSource, /placementMode !== 'comment'/);
  assert.match(appSource, /placementMode !== 'signature'/);
});
