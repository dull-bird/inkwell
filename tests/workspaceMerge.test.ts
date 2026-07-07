import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMergePaths } from '../src/workspaceMerge';

test('builds merge paths in workspace order', () => {
  assert.deepEqual(
    buildMergePaths([
      { path: '/docs/first.pdf' },
      { path: '/docs/second.pdf' },
      { path: '/docs/third.pdf' },
    ]),
    ['/docs/first.pdf', '/docs/second.pdf', '/docs/third.pdf'],
  );
});

test('requires at least two documents to merge', () => {
  assert.throws(() => buildMergePaths([{ path: '/docs/only.pdf' }]), /at least two PDFs/);
});
