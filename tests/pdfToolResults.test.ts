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

test('opens highlighted PDF output from agent highlight tools', () => {
  assert.deepEqual(
    derivePdfToolAction('highlight_pdf_headings', {
      output: '/tmp/paper_applied.pdf',
      operations: highlightOperations,
    }),
    { kind: 'file-output', path: '/tmp/paper_applied.pdf' },
  );
  assert.deepEqual(
    derivePdfToolAction('highlight_pdf_text', {
      output: '/tmp/paper_applied.pdf',
      operations: highlightOperations,
    }),
    { kind: 'file-output', path: '/tmp/paper_applied.pdf' },
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

test('derives preview action from nested SDK result wrappers', () => {
  assert.deepEqual(
    derivePdfToolAction('find_pdf_text', {
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ operations: highlightOperations }),
          },
        ],
      },
    }),
    {
      kind: 'preview-highlights',
      operations: highlightOperations,
    },
  );
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

test('derives folder output action from image export result', () => {
  assert.deepEqual(
    derivePdfToolAction('export_pdf_pages_as_images', {
      output_dir: '/tmp/inkwell-images',
      files: ['/tmp/inkwell-images/page_0001.png', '/tmp/inkwell-images/page_0002.png'],
    }),
    {
      kind: 'folder-output',
      outputDir: '/tmp/inkwell-images',
      fileCount: 2,
      label: 'Open image folder',
    },
  );
});

test('derives folder output action from embedded image extraction result', () => {
  assert.deepEqual(
    derivePdfToolAction('extract_pdf_images', {
      output_dir: '/tmp/inkwell-extracted-images',
      images: [
        { path: '/tmp/inkwell-extracted-images/page_0001_image_001.png' },
        { path: '/tmp/inkwell-extracted-images/page_0002_image_001.jpg' },
      ],
    }),
    {
      kind: 'folder-output',
      outputDir: '/tmp/inkwell-extracted-images',
      fileCount: 2,
      label: 'Open extracted images',
    },
  );
});

test('derives folder output action from attachment extraction result', () => {
  assert.deepEqual(
    derivePdfToolAction('extract_pdf_attachments', {
      output_dir: '/tmp/inkwell-attachments',
      files: [{ path: '/tmp/inkwell-attachments/note.txt' }, { path: '/tmp/inkwell-attachments/data.csv' }],
    }),
    {
      kind: 'folder-output',
      outputDir: '/tmp/inkwell-attachments',
      fileCount: 2,
      label: 'Open attachments folder',
    },
  );
});

test('derives path output action from text export result', () => {
  assert.deepEqual(
    derivePdfToolAction('export_pdf_text', {
      output: '/tmp/paper_markdown.md',
      format: 'markdown',
    }),
    {
      kind: 'path-output',
      path: '/tmp/paper_markdown.md',
      label: 'Open Markdown export',
    },
  );
  assert.deepEqual(
    derivePdfToolAction('export_pdf_text', {
      output: '/tmp/paper_text.txt',
      format: 'text',
    }),
    {
      kind: 'path-output',
      path: '/tmp/paper_text.txt',
      label: 'Open text export',
    },
  );
});

test('derives file output action for mutating PDF tools', () => {
  assert.deepEqual(derivePdfToolAction('add_pdf_comment', { output: '/tmp/commented.pdf' }), {
    kind: 'file-output',
    path: '/tmp/commented.pdf',
  });
  assert.deepEqual(derivePdfToolAction('add_pdf_free_text', { output: '/tmp/free_text.pdf' }), {
    kind: 'file-output',
    path: '/tmp/free_text.pdf',
  });
  assert.deepEqual(derivePdfToolAction('add_pdf_stamp', { output: '/tmp/stamped.pdf' }), {
    kind: 'file-output',
    path: '/tmp/stamped.pdf',
  });
  assert.deepEqual(derivePdfToolAction('add_pdf_shape', { output: '/tmp/shaped.pdf' }), {
    kind: 'file-output',
    path: '/tmp/shaped.pdf',
  });
  assert.deepEqual(derivePdfToolAction('insert_pdf_image', { output: '/tmp/image.pdf' }), {
    kind: 'file-output',
    path: '/tmp/image.pdf',
  });
  assert.deepEqual(derivePdfToolAction('underline_pdf_text', { output: '/tmp/underlined.pdf' }), {
    kind: 'file-output',
    path: '/tmp/underlined.pdf',
  });
  assert.deepEqual(derivePdfToolAction('strikeout_pdf_text', { output: '/tmp/strikeout.pdf' }), {
    kind: 'file-output',
    path: '/tmp/strikeout.pdf',
  });
  assert.deepEqual(derivePdfToolAction('redact_pdf_text', { output: '/tmp/redacted.pdf' }), {
    kind: 'file-output',
    path: '/tmp/redacted.pdf',
  });
  assert.deepEqual(derivePdfToolAction('extract_pdf_pages', { output: '/tmp/extracted.pdf' }), {
    kind: 'file-output',
    path: '/tmp/extracted.pdf',
  });
  assert.deepEqual(derivePdfToolAction('insert_blank_pdf_pages', { output: '/tmp/blank_pages.pdf' }), {
    kind: 'file-output',
    path: '/tmp/blank_pages.pdf',
  });
  assert.deepEqual(derivePdfToolAction('resize_pdf_pages', { output: '/tmp/resized.pdf' }), {
    kind: 'file-output',
    path: '/tmp/resized.pdf',
  });
  assert.deepEqual(derivePdfToolAction('crop_pdf_pages', { output: '/tmp/cropped.pdf' }), {
    kind: 'file-output',
    path: '/tmp/cropped.pdf',
  });
  assert.deepEqual(derivePdfToolAction('set_pdf_outline', { output: '/tmp/outlined.pdf' }), {
    kind: 'file-output',
    path: '/tmp/outlined.pdf',
  });
  assert.deepEqual(derivePdfToolAction('add_pdf_attachment', { output: '/tmp/attached.pdf' }), {
    kind: 'file-output',
    path: '/tmp/attached.pdf',
  });
  assert.deepEqual(derivePdfToolAction('remove_pdf_attachments', { output: '/tmp/attachments_removed.pdf' }), {
    kind: 'file-output',
    path: '/tmp/attachments_removed.pdf',
  });
  assert.deepEqual(derivePdfToolAction('create_pdf_from_images', { output: '/tmp/images.pdf' }), {
    kind: 'file-output',
    path: '/tmp/images.pdf',
  });
  assert.deepEqual(derivePdfToolAction('convert_html_to_pdf', { output: '/tmp/html.pdf' }), {
    kind: 'file-output',
    path: '/tmp/html.pdf',
  });
  assert.deepEqual(derivePdfToolAction('convert_markdown_to_pdf', { output: '/tmp/markdown.pdf' }), {
    kind: 'file-output',
    path: '/tmp/markdown.pdf',
  });
  assert.deepEqual(derivePdfToolAction('add_image_signature', { output: '/tmp/image_signed.pdf' }), {
    kind: 'file-output',
    path: '/tmp/image_signed.pdf',
  });
  assert.deepEqual(derivePdfToolAction('compress_pdf', { output: '/tmp/compressed.pdf' }), {
    kind: 'file-output',
    path: '/tmp/compressed.pdf',
  });
});

test('ignores non-mutating PDF outputs that should stay in chat only', () => {
  assert.equal(derivePdfToolAction('read_pdf_text', { output: '/tmp/not-a-pdf-edit.pdf' }), null);
});
