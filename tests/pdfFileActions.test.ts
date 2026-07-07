import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEncryptRequest, buildWatermarkRequest, describeFileOutput } from '../src/pdfFileActions';

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
