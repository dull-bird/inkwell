import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkspaceSummaryPrompt } from '../src/workspaceContext';

test('builds a multi-document prompt with paths and document classes', () => {
  const prompt = buildWorkspaceSummaryPrompt([
    {
      title: 'paper.pdf',
      path: '/docs/paper.pdf',
      label: '学术论文',
      summary: '小雀识别为学术论文，依据：abstract、references。',
    },
    {
      title: 'contract.pdf',
      path: '/docs/contract.pdf',
      label: '合同',
      summary: '小雀识别为合同，依据：agreement、termination。',
    },
  ]);

  assert.match(prompt, /paper\.pdf/);
  assert.match(prompt, /\/docs\/paper\.pdf/);
  assert.match(prompt, /学术论文/);
  assert.match(prompt, /contract\.pdf/);
  assert.match(prompt, /\/docs\/contract\.pdf/);
  assert.match(prompt, /合同/);
  assert.match(prompt, /read_pdf_text/);
});

test('rejects workspace prompt without at least two documents', () => {
  assert.throws(
    () =>
      buildWorkspaceSummaryPrompt([
        {
          title: 'single.pdf',
          path: '/docs/single.pdf',
          label: '普通文档',
          summary: '普通文档。',
        },
      ]),
    /at least two PDFs/,
  );
});
