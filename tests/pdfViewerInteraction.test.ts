import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pdfViewerSource = readFileSync(resolve('src/components/PdfViewer.tsx'), 'utf8');
const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};

test('React PDF surface hands off to native Qt/PDF4QT shell instead of rendering PDF pages', () => {
  assert.doesNotMatch(pdfViewerSource, /from ['"]react-pdf['"]/);
  assert.doesNotMatch(pdfViewerSource, /pdfjs-dist/);
  assert.doesNotMatch(pdfViewerSource, /<Document\b/);
  assert.doesNotMatch(pdfViewerSource, /<Page\b/);
  assert.doesNotMatch(pdfViewerSource, /export_pages_as_images/);
  assert.doesNotMatch(pdfViewerSource, /pdf-page-image/);
  assert.match(pdfViewerSource, /openNativeShell\(path\)/);
  assert.match(pdfViewerSource, /Open Native Shell/);
});

test('Open PDF launches the native shell before loading React workspace metadata', () => {
  const handleOpenFileSource = sourceBlock(appSource, 'const handleOpenFile = async () => {', 'const handleOpenFolder');
  const openDialogIndex = handleOpenFileSource.indexOf('openPdfFile()');
  const nativeShellIndex = handleOpenFileSource.indexOf('openNativeShell(path)');
  const loadPdfIndex = handleOpenFileSource.indexOf('loadPdf(path)');

  assert.ok(openDialogIndex > -1, 'Open PDF should still use the system file picker.');
  assert.ok(nativeShellIndex > -1, 'Open PDF should immediately hand the document to the native PDF4QT shell.');
  assert.ok(loadPdfIndex > -1, 'Open PDF should still load workspace metadata for the agent side panel.');
  assert.ok(openDialogIndex < nativeShellIndex, 'Native shell launch needs the selected PDF path.');
  assert.ok(nativeShellIndex < loadPdfIndex, 'Native PDF4QT shell should be the primary open path, before React metadata loading.');
});

test('does not ship react-pdf or pdfjs frontend dependencies', () => {
  assert.equal(packageJson.dependencies?.['react-pdf'], undefined);
  assert.equal(packageJson.dependencies?.['pdfjs-dist'], undefined);
});

test('existing annotation tools remain available during native-shell migration', () => {
  assert.match(appSource, /beginPlacement\('comment'\)/);
  assert.match(appSource, /beginPlacement\('free-text'\)/);
  assert.match(appSource, /beginPlacement\('stamp'\)/);
  assert.match(appSource, /beginPlacement\('shape'\)/);
  assert.match(appSource, /beginPlacement\('image'\)/);
  assert.match(appSource, /beginPlacement\('signature'\)/);
  assert.match(appSource, /beginPlacement\('image-signature'\)/);
});

function sourceBlock(source: string, startMarker: string, endMarker: string): string {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  assert.ok(startIndex > -1, `Missing source marker: ${startMarker}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${endMarker}`);
  return source.slice(startIndex, endIndex);
}
