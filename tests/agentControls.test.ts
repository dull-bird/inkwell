import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentPromptOptions, reasoningInstruction } from '../src/agentControls';

test('omits model and mode when agent default is selected', () => {
  assert.deepEqual(buildAgentPromptOptions('default', '', 'default', 'auto'), { reasoningLevel: 'auto' });
});

test('uses trimmed custom model id', () => {
  assert.deepEqual(buildAgentPromptOptions('custom', '  claude-sonnet  ', 'plan', 'high'), {
    modelId: 'claude-sonnet',
    modeId: 'plan',
    reasoningLevel: 'high',
  });
});

test('describes reasoning levels for the prompt envelope', () => {
  assert.match(reasoningInstruction('high'), /deep reasoning/);
  assert.equal(reasoningInstruction('auto'), '');
});
