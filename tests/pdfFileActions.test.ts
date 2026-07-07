import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEncryptRequest,
  buildFillFormRequest,
  buildTypedSignatureRequest,
  buildWatermarkRequest,
  describeFileOutput,
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

test('rejects empty typed signature text', () => {
  assert.throws(() => buildTypedSignatureRequest('/docs/form.pdf', 0, 72, 520, ' '), /Signature text/);
});
