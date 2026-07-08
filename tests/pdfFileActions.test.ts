import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompressRequest,
  buildCropRequest,
  buildEncryptRequest,
  buildExportImagesRequest,
  buildExportTextRequest,
  buildAddAttachmentRequest,
  buildExtractAttachmentsRequest,
  buildHtmlToPdfRequest,
  buildImageSignatureRequest,
  buildImagesToPdfRequest,
  buildExtractImagesRequest,
  buildExtractPagesRequest,
  buildFillFormRequest,
  buildFreeTextRequest,
  buildInsertBlankPagesRequest,
  buildInsertImageRequest,
  buildMarkdownToPdfRequest,
  buildRemoveAttachmentsRequest,
  buildResizePagesRequest,
  buildSetOutlineRequest,
  buildShapeRequest,
  buildRedactRequest,
  buildStampRequest,
  buildTextMarkupRequest,
  buildTypedSignatureRequest,
  buildWatermarkRequest,
  describeCompressionOutput,
  describeFileOutput,
  parseCropMargins,
  parseAttachmentNames,
  parseNonNegativeNumber,
  parsePageSize,
  parseShapeDimensions,
  SHAPE_ANNOTATION_KINDS,
  STANDARD_STAMP_KINDS,
} from '../src/pdfFileActions';

test('builds a trimmed watermark request', () => {
  assert.deepEqual(buildWatermarkRequest('/docs/a.pdf', '  Internal Review  '), {
    path: '/docs/a.pdf',
    text: 'Internal Review',
  });
});

test('rejects empty watermark text', () => {
  assert.throws(() => buildWatermarkRequest('/docs/a.pdf', '   '), /Watermark text/);
});

test('builds a compression request', () => {
  assert.deepEqual(buildCompressRequest('/docs/a.pdf'), { path: '/docs/a.pdf' });
});

test('describes compression savings in bytes and percent', () => {
  assert.equal(
    describeCompressionOutput('/docs/a_compressed.pdf', 2048, 12.345),
    '已压缩并打开 a_compressed.pdf 文件大小减少 2.0 KiB（12.35%）。',
  );
});

test('builds an encrypt request with matching owner password', () => {
  assert.deepEqual(buildEncryptRequest('/docs/a.pdf', 'secret'), {
    path: '/docs/a.pdf',
    user_pw: 'secret',
    owner_pw: 'secret',
  });
});

test('does not auto-open encrypted output', () => {
  assert.equal(
    describeFileOutput('encrypt', '/docs/a_encrypted.pdf'),
    '已加密输出 a_encrypted.pdf。加密文件不会自动打开，请用系统 PDF 阅读器验证密码。',
  );
});

test('builds form fill request from JSON object text', () => {
  assert.deepEqual(buildFillFormRequest('/docs/form.pdf', '{ "name": "Lei Li", "age": 18 }'), {
    path: '/docs/form.pdf',
    values: { name: 'Lei Li', age: 18 },
  });
});

test('rejects form fill JSON that is not an object', () => {
  assert.throws(() => buildFillFormRequest('/docs/form.pdf', '["Lei Li"]'), /JSON object/);
});

test('builds typed signature request at selected PDF point', () => {
  assert.deepEqual(buildTypedSignatureRequest('/docs/form.pdf', 0, 72, 520, ' Lei Li '), {
    path: '/docs/form.pdf',
    page: 0,
    x: 72,
    y: 520,
    text: 'Lei Li',
    signer: 'Lei Li',
  });
});

test('builds image signature request at selected PDF point', () => {
  assert.deepEqual(buildImageSignatureRequest('/docs/form.pdf', 0, 72, 520, ' /tmp/sign.png ', '180, 60', ' Lei Li '), {
    path: '/docs/form.pdf',
    page: 0,
    x: 72,
    y: 520,
    image_path: '/tmp/sign.png',
    width: 180,
    height: 60,
    signer: 'Lei Li',
  });
});

test('rejects empty typed signature text', () => {
  assert.throws(() => buildTypedSignatureRequest('/docs/form.pdf', 0, 72, 520, ' '), /Signature text/);
  assert.throws(() => buildImageSignatureRequest('/docs/form.pdf', 0, 72, 520, ' ', '180, 60'), /Signature image path/);
});

test('builds free text request at selected PDF point', () => {
  assert.deepEqual(buildFreeTextRequest('/docs/form.pdf', 0, 72, 180, ' Visible note ', ' Reviewer '), {
    path: '/docs/form.pdf',
    page: 0,
    x: 72,
    y: 180,
    text: 'Visible note',
    author: 'Reviewer',
  });
});

test('rejects empty free text', () => {
  assert.throws(() => buildFreeTextRequest('/docs/form.pdf', 0, 72, 180, ' '), /Free text/);
});

test('describes visible free text output', () => {
  assert.equal(describeFileOutput('free-text', '/docs/a_free_text.pdf'), '已添加可见文本并打开 a_free_text.pdf');
});

test('builds a standard stamp request at selected PDF point', () => {
  assert.ok(STANDARD_STAMP_KINDS.includes('Approved'));
  assert.deepEqual(buildStampRequest('/docs/a.pdf', 0, 72, 180, 'Approved', ' Reviewer '), {
    path: '/docs/a.pdf',
    page: 0,
    x: 72,
    y: 180,
    stamp: 'Approved',
    author: 'Reviewer',
  });
});

test('describes stamp output', () => {
  assert.equal(describeFileOutput('stamp', '/docs/a_stamped.pdf'), '已添加印章并打开 a_stamped.pdf');
});

test('builds a standard shape annotation request at selected PDF point', () => {
  assert.ok(SHAPE_ANNOTATION_KINDS.includes('rectangle'));
  assert.deepEqual(buildShapeRequest('/docs/a.pdf', 0, 72, 180, 'ellipse', '120, 60', ' Reviewer '), {
    path: '/docs/a.pdf',
    page: 0,
    x: 72,
    y: 180,
    kind: 'ellipse',
    width: 120,
    height: 60,
    color: [0.1, 0.45, 0.95],
    stroke_width: 2,
    author: 'Reviewer',
  });
});

test('builds an image insertion request at selected PDF point', () => {
  assert.deepEqual(buildInsertImageRequest('/docs/a.pdf', 0, 72, 180, ' /tmp/photo.png ', '180, 120'), {
    path: '/docs/a.pdf',
    page: 0,
    x: 72,
    y: 180,
    image_path: '/tmp/photo.png',
    width: 180,
    height: 120,
  });
});

test('parses shape dimensions', () => {
  assert.deepEqual(parseShapeDimensions(' 90 '), { width: 90, height: 90 });
  assert.deepEqual(parseShapeDimensions('120, 60'), { width: 120, height: 60 });
});

test('rejects invalid shape dimensions', () => {
  assert.throws(() => buildShapeRequest('/docs/a.pdf', 0, 72, 180, 'rectangle', '0, 60'), /positive numbers/);
  assert.throws(() => buildInsertImageRequest('/docs/a.pdf', 0, 72, 180, ' ', '180, 120'), /Image path/);
  assert.throws(() => buildInsertImageRequest('/docs/a.pdf', 0, 72, 180, '/tmp/photo.png', '0'), /Image dimensions/);
});

test('describes shape output', () => {
  assert.equal(describeFileOutput('shape', '/docs/a_shaped.pdf'), '已添加形状标注并打开 a_shaped.pdf');
  assert.equal(describeFileOutput('insert-image', '/docs/a_image.pdf'), '已插入图片并打开 a_image.pdf');
  assert.equal(describeFileOutput('image-signature', '/docs/a_image_signed.pdf'), '已添加图片签名并打开 a_image_signed.pdf');
});

test('builds text markup requests with kind-specific colors', () => {
  assert.deepEqual(buildTextMarkupRequest('/docs/a.pdf', ' Risk clause ', 'underline', ' Reviewer '), {
    path: '/docs/a.pdf',
    query: 'Risk clause',
    kind: 'underline',
    color: [0.1, 0.45, 0.95],
    author: 'Reviewer',
  });
  assert.deepEqual(buildTextMarkupRequest('/docs/a.pdf', ' obsolete ', 'strikeout'), {
    path: '/docs/a.pdf',
    query: 'obsolete',
    kind: 'strikeout',
    color: [0.85, 0.12, 0.12],
    author: 'Sparrow',
  });
});

test('rejects empty text markup query', () => {
  assert.throws(() => buildTextMarkupRequest('/docs/a.pdf', ' ', 'underline'), /Markup text/);
});

test('describes text markup outputs', () => {
  assert.equal(describeFileOutput('underline', '/docs/a_underlined.pdf'), '已添加下划线并打开 a_underlined.pdf');
  assert.equal(describeFileOutput('strikeout', '/docs/a_strikeout.pdf'), '已添加删除线并打开 a_strikeout.pdf');
});

test('builds a redaction request with optional page indices', () => {
  assert.deepEqual(buildRedactRequest('/docs/a.pdf', ' SSN 123-45-6789 ', [0, 2]), {
    path: '/docs/a.pdf',
    query: 'SSN 123-45-6789',
    page_indices: [0, 2],
  });
});

test('rejects empty redaction query', () => {
  assert.throws(() => buildRedactRequest('/docs/a.pdf', ' '), /Redaction text/);
});

test('describes redaction output', () => {
  assert.equal(describeFileOutput('redact', '/docs/a_redacted.pdf'), '已涂黑并移除文本，已打开 a_redacted.pdf');
});

test('builds an extract pages request', () => {
  assert.deepEqual(buildExtractPagesRequest('/docs/a.pdf', [0, 2]), {
    path: '/docs/a.pdf',
    page_indices: [0, 2],
  });
});

test('rejects empty or invalid extract page indices', () => {
  assert.throws(() => buildExtractPagesRequest('/docs/a.pdf', []), /Select at least one page/);
  assert.throws(() => buildExtractPagesRequest('/docs/a.pdf', [-1]), /non-negative integers/);
});

test('describes extracted page output', () => {
  assert.equal(describeFileOutput('extract', '/docs/a_extracted.pdf'), '已提取页面并打开 a_extracted.pdf');
});

test('builds an insert blank pages request', () => {
  assert.deepEqual(buildInsertBlankPagesRequest('/docs/a.pdf', '2', '3', 5, '300 x 400'), {
    path: '/docs/a.pdf',
    insert_index: 2,
    count: 3,
    width: 300,
    height: 400,
  });
  assert.deepEqual(buildInsertBlankPagesRequest('/docs/a.pdf', '', '', 5), {
    path: '/docs/a.pdf',
    insert_index: 5,
    count: 1,
  });
});

test('rejects invalid blank page insertion options', () => {
  assert.throws(() => buildInsertBlankPagesRequest('/docs/a.pdf', '6', '1', 5), /Insert position/);
  assert.throws(() => buildInsertBlankPagesRequest('/docs/a.pdf', '1', '0', 5), /Blank page count/);
});

test('describes inserted blank page output', () => {
  assert.equal(
    describeFileOutput('insert-blank-pages', '/docs/a_blank_pages.pdf'),
    '已插入空白页并打开 a_blank_pages.pdf',
  );
});

test('builds an image export request with optional page indices', () => {
  assert.deepEqual(buildExportImagesRequest('/docs/a.pdf', ' 200 ', [0, 2]), {
    path: '/docs/a.pdf',
    dpi: 200,
    page_indices: [0, 2],
  });
  assert.deepEqual(buildExportImagesRequest('/docs/a.pdf', '144'), {
    path: '/docs/a.pdf',
    dpi: 144,
  });
});

test('rejects invalid image export DPI', () => {
  assert.throws(() => buildExportImagesRequest('/docs/a.pdf', '12'), /DPI/);
  assert.throws(() => buildExportImagesRequest('/docs/a.pdf', '144.5'), /DPI/);
});

test('builds a text export request with optional page indices', () => {
  assert.deepEqual(buildExportTextRequest('/docs/a.pdf', 'markdown', [0, 2]), {
    path: '/docs/a.pdf',
    format: 'markdown',
    page_indices: [0, 2],
  });
  assert.deepEqual(buildExportTextRequest('/docs/a.pdf', 'text'), {
    path: '/docs/a.pdf',
    format: 'text',
  });
});

test('builds an embedded image extraction request with optional page indices', () => {
  assert.deepEqual(buildExtractImagesRequest('/docs/a.pdf', [0, 2]), {
    path: '/docs/a.pdf',
    page_indices: [0, 2],
  });
  assert.deepEqual(buildExtractImagesRequest('/docs/a.pdf'), {
    path: '/docs/a.pdf',
  });
});

test('builds a resize pages request with optional page indices', () => {
  assert.deepEqual(buildResizePagesRequest('/docs/a.pdf', '612, 792', [0, 2]), {
    path: '/docs/a.pdf',
    width: 612,
    height: 792,
    page_indices: [0, 2],
  });
});

test('parses page sizes and rejects invalid sizes', () => {
  assert.deepEqual(parsePageSize('595 x 842'), { width: 595, height: 842 });
  assert.deepEqual(parsePageSize('300,400'), { width: 300, height: 400 });
  assert.throws(() => parsePageSize('300'), /Page size/);
  assert.throws(() => parsePageSize('300,0'), /Page size/);
});

test('describes resized page output', () => {
  assert.equal(describeFileOutput('resize-pages', '/docs/a_resized.pdf'), '已调整页面尺寸并打开 a_resized.pdf');
});

test('builds conversion requests for image, HTML, and Markdown to PDF', () => {
  assert.deepEqual(buildImagesToPdfRequest('/tmp/a.png\n/tmp/b.jpg', '612, 792', '24'), {
    image_paths: ['/tmp/a.png', '/tmp/b.jpg'],
    width: 612,
    height: 792,
    margin: 24,
  });
  assert.deepEqual(buildHtmlToPdfRequest(' <h1>Hello</h1> ', ' HTML Doc ', '595, 842', '36'), {
    html: '<h1>Hello</h1>',
    title: 'HTML Doc',
    width: 595,
    height: 842,
    margin: 36,
  });
  assert.deepEqual(buildMarkdownToPdfRequest(' # Hello ', '', '595, 842', '18'), {
    markdown: '# Hello',
    title: 'Inkwell Markdown Export',
    width: 595,
    height: 842,
    margin: 18,
  });
});

test('rejects invalid conversion requests', () => {
  assert.throws(() => buildImagesToPdfRequest('', '595, 842', '36'), /image path/);
  assert.throws(() => buildHtmlToPdfRequest(' ', 'HTML', '595, 842', '36'), /HTML content/);
  assert.throws(() => buildMarkdownToPdfRequest(' ', 'Markdown', '595, 842', '36'), /Markdown content/);
  assert.throws(() => parseNonNegativeNumber('-1', 'Margin'), /non-negative/);
});

test('describes conversion outputs', () => {
  assert.equal(describeFileOutput('images-to-pdf', '/tmp/a_images.pdf'), '已将图片转换为 PDF 并打开 a_images.pdf');
  assert.equal(describeFileOutput('html-to-pdf', '/tmp/html.pdf'), '已将 HTML 转换为 PDF 并打开 html.pdf');
  assert.equal(
    describeFileOutput('markdown-to-pdf', '/tmp/markdown.pdf'),
    '已将 Markdown 转换为 PDF 并打开 markdown.pdf',
  );
});

test('builds a set outline request from JSON objects and arrays', () => {
  assert.deepEqual(
    buildSetOutlineRequest(
      '/docs/a.pdf',
      '[{"level":1,"title":"Intro","page":1}, [2, "Details", 2]]',
      3,
    ),
    {
      path: '/docs/a.pdf',
      outline: [
        { level: 1, title: 'Intro', page: 1 },
        { level: 2, title: 'Details', page: 2 },
      ],
    },
  );
});

test('rejects invalid outline JSON and skipped levels', () => {
  assert.throws(() => buildSetOutlineRequest('/docs/a.pdf', '{}', 3), /JSON array/);
  assert.throws(() => buildSetOutlineRequest('/docs/a.pdf', '[{"level":2,"title":"Bad","page":1}]', 3), /cannot skip/);
  assert.throws(() => buildSetOutlineRequest('/docs/a.pdf', '[{"level":1,"title":"Bad","page":4}]', 3), /between 1 and 3/);
});

test('builds attachment requests and parses names', () => {
  assert.deepEqual(buildAddAttachmentRequest('/docs/a.pdf', ' /tmp/note.txt ', ' review-note.txt ', ' review note '), {
    path: '/docs/a.pdf',
    file_path: '/tmp/note.txt',
    name: 'review-note.txt',
    description: 'review note',
  });
  assert.deepEqual(buildExtractAttachmentsRequest('/docs/a.pdf', 'one.txt\ntwo.txt'), {
    path: '/docs/a.pdf',
    names: ['one.txt', 'two.txt'],
  });
  assert.deepEqual(buildExtractAttachmentsRequest('/docs/a.pdf', ''), { path: '/docs/a.pdf' });
  assert.deepEqual(buildRemoveAttachmentsRequest('/docs/a.pdf', 'one.txt, two.txt'), {
    path: '/docs/a.pdf',
    names: ['one.txt', 'two.txt'],
  });
  assert.deepEqual(parseAttachmentNames(' one.txt,\n two.txt '), ['one.txt', 'two.txt']);
});

test('rejects empty attachment add and remove requests', () => {
  assert.throws(() => buildAddAttachmentRequest('/docs/a.pdf', ' ', '', ''), /file path/);
  assert.throws(() => buildRemoveAttachmentsRequest('/docs/a.pdf', ' '), /attachment name/);
});

test('describes outline and attachment mutating outputs', () => {
  assert.equal(describeFileOutput('set-outline', '/docs/a_outlined.pdf'), '已更新书签并打开 a_outlined.pdf');
  assert.equal(describeFileOutput('add-attachment', '/docs/a_attached.pdf'), '已添加附件并打开 a_attached.pdf');
  assert.equal(
    describeFileOutput('remove-attachments', '/docs/a_attachments_removed.pdf'),
    '已移除附件并打开 a_attachments_removed.pdf',
  );
});

test('parses one crop margin for every page edge', () => {
  assert.deepEqual(parseCropMargins(' 12 '), { left: 12, top: 12, right: 12, bottom: 12 });
});

test('parses explicit left top right bottom crop margins', () => {
  assert.deepEqual(parseCropMargins('10, 20, 30, 40'), {
    left: 10,
    top: 20,
    right: 30,
    bottom: 40,
  });
});

test('rejects malformed crop margins', () => {
  assert.throws(() => parseCropMargins('10, 20'), /one number or four numbers/);
  assert.throws(() => parseCropMargins('-1, 0, 0, 0'), /non-negative/);
});

test('builds a crop request with optional page indices', () => {
  assert.deepEqual(buildCropRequest('/docs/a.pdf', '10 20 30 40', [0, 2]), {
    path: '/docs/a.pdf',
    margins: { left: 10, top: 20, right: 30, bottom: 40 },
    page_indices: [0, 2],
  });
});
