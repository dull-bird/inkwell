import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePdfPaths } from '../src/workspaceFiles';

test('normalizes folder file results into sorted unique PDF paths', () => {
  assert.deepEqual(
    normalizePdfPaths([
      '/docs/zeta.PDF',
      '/docs/readme.md',
      '/docs/alpha.pdf',
      '/docs/nested/Beta.Pdf',
      '/docs/alpha.pdf',
      '/docs/image.png',
    ]),
    ['/docs/alpha.pdf', '/docs/nested/Beta.Pdf', '/docs/zeta.PDF'],
  );
});

test('returns an empty array when no PDFs are present', () => {
  assert.deepEqual(normalizePdfPaths(['/docs/readme.md', '/docs/image.png']), []);
});
