import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSemanticHeadingHighlightPrompt } from '../src/agentPrompts';

test('semantic heading highlight prompt asks AI to analyze then use text search previews', () => {
  const prompt = buildSemanticHeadingHighlightPrompt('sample.pdf');
  assert.match(prompt, /read_pdf_text/);
  assert.match(prompt, /find_pdf_text/);
  assert.match(prompt, /do not save/i);
  assert.doesNotMatch(prompt, /highlight_pdf_headings/);
});
