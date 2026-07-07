import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePageRanges } from '../src/pdfRanges';

test('returns null for empty page range input', () => {
  assert.equal(parsePageRanges(''), null);
  assert.equal(parsePageRanges('   '), null);
});

test('parses comma separated 1-based page ranges', () => {
  assert.deepEqual(parsePageRanges('2-5, 7, 10-12'), [
    [2, 5],
    [7, 7],
    [10, 12],
  ]);
});

test('rejects zero and reversed page ranges', () => {
  assert.throws(() => parsePageRanges('0'), /Page numbers start at 1/);
  assert.throws(() => parsePageRanges('8-3'), /Invalid page range/);
});

test('rejects malformed page range input', () => {
  assert.throws(() => parsePageRanges('1, intro'), /Invalid page range/);
});
