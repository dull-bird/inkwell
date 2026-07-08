import test from 'node:test';
import assert from 'node:assert/strict';
import { countHighlightRects } from '../src/pdfHighlights';

test('counts individual highlight rectangles across page-grouped operations', () => {
  assert.equal(
    countHighlightRects([
      { rects: [{}, {}] },
      { rects: [{}] },
    ]),
    3,
  );
});

test('ignores malformed highlight entries when counting matches', () => {
  assert.equal(countHighlightRects([{ rects: null }, {}, { rects: 'not-array' }]), 0);
});
