import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLocalPdfCommand } from '../src/commandRouter';

test('routes heading highlight commands locally', () => {
  assert.deepEqual(routeLocalPdfCommand('给每个标题高亮'), { kind: 'highlight-headings' });
  assert.deepEqual(routeLocalPdfCommand('highlight every heading'), { kind: 'highlight-headings' });
});

test('routes specific text highlight commands locally', () => {
  assert.deepEqual(routeLocalPdfCommand('高亮 transformer'), { kind: 'highlight-text', query: 'transformer' });
  assert.deepEqual(routeLocalPdfCommand('请高亮「retrieval augmented generation」'), {
    kind: 'highlight-text',
    query: 'retrieval augmented generation',
  });
  assert.deepEqual(routeLocalPdfCommand('highlight contract termination clause'), {
    kind: 'highlight-text',
    query: 'contract termination clause',
  });
});

test('leaves non-local commands to the agent', () => {
  assert.deepEqual(routeLocalPdfCommand('总结这份 PDF'), { kind: 'agent' });
  assert.deepEqual(routeLocalPdfCommand(''), { kind: 'empty' });
});
