import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiBrushPrompt, validateAiBrushRun } from '../src/aiBrush';

test('blocks AI brush until the user enables AI for the document', () => {
  assert.throws(() => validateAiBrushRun(false, 'highlight contradictions'), /Enable AI/);
});

test('requires a non-empty AI brush instruction', () => {
  assert.throws(() => validateAiBrushRun(true, '   '), /Brush instruction/);
});

test('builds a guarded AI brush prompt for agent-side PDF tools', () => {
  assert.match(
    buildAiBrushPrompt('notes.pdf', 'highlight claims that need citations'),
    /Preview the result in the current PDF when possible/,
  );
});
