import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchPrompt } from '../src/researchContext';

test('builds a web research prompt with document path, links, and download options', () => {
  const prompt = buildResearchPrompt(
    {
      title: 'rag-paper.pdf',
      path: '/docs/rag-paper.pdf',
      label: '学术论文',
      summary: '小雀识别为学术论文，依据：abstract、references。',
    },
    '请联网搜索这篇论文相关资料和后续工作，并在回答中给链接。',
  );

  assert.match(prompt, /rag-paper\.pdf/);
  assert.match(prompt, /\/docs\/rag-paper\.pdf/);
  assert.match(prompt, /学术论文/);
  assert.match(prompt, /联网搜索/);
  assert.match(prompt, /链接/);
  assert.match(prompt, /下载/);
  assert.match(prompt, /read_pdf_text/);
});
