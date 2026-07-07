import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePdfToolAction } from '../src/pdfToolResults';

const highlightOperations = [
  {
    id: 'h1',
    page: 0,
    rects: [{ x0: 10, y0: 20, x1: 90, y1: 35 }],
    color: [1, 0.9, 0],
    opacity: 0.25,
    text: 'Introduction',
  },
];

test('derives preview action from direct highlight tool result', () => {
  assert.deepEqual(
    derivePdfToolAction('highlight_pdf_headings', { operations: highlightOperations }),
    { kind: 'preview-highlights', operations: highlightOperations },
  );
});

test('derives preview action from MCP text content result', () => {
  const result = {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ operations: highlightOperations }),
      },
    ],
  };

  assert.deepEqual(derivePdfToolAction('find_pdf_text', result), {
    kind: 'preview-highlights',
    operations: highlightOperations,
  });
});

test('derives split output action from wrapped output array result', () => {
  const result = {
    output: [
      {
        type: 'text',
        text: JSON.stringify({ output_dir: '/tmp/inkwell-split', files: ['p1.pdf', 'p2.pdf'] }),
      },
    ],
  };

  assert.deepEqual(derivePdfToolAction('split_pdf', result), {
    kind: 'split-output',
    outputDir: '/tmp/inkwell-split',
    fileCount: 2,
  });
});

test('derives file output action for mutating PDF tools', () => {
  assert.deepEqual(derivePdfToolAction('add_pdf_comment', { output: '/tmp/commented.pdf' }), {
    kind: 'file-output',
    path: '/tmp/commented.pdf',
  });
});

test('ignores non-mutating PDF outputs that should stay in chat only', () => {
  assert.equal(derivePdfToolAction('read_pdf_text', { output: '/tmp/not-a-pdf-edit.pdf' }), null);
});
