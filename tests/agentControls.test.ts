import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentPromptOptions,
  describeCatalogModelId,
  groupCatalogModels,
  reasoningInstruction,
  reasoningOptionsForModel,
  resolveCatalogModelSelection,
} from '../src/agentControls';

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

test('uses model id discovered from the ACP agent catalog', () => {
  assert.deepEqual(buildAgentPromptOptions('catalog:gpt-5.1-codex', '', 'default', 'medium'), {
    modelId: 'gpt-5.1-codex',
    reasoningLevel: 'medium',
  });
});

test('uses mode id discovered from the ACP agent catalog', () => {
  assert.deepEqual(buildAgentPromptOptions('default', '', 'architect', 'auto'), {
    modeId: 'architect',
    reasoningLevel: 'auto',
  });
});

test('describes reasoning levels for the prompt envelope', () => {
  assert.match(reasoningInstruction('high'), /deep reasoning/);
  assert.match(reasoningInstruction('xhigh'), /deepest available reasoning/);
  assert.equal(reasoningInstruction('auto'), '');
});

test('groups ACP model variants that encode reasoning effort in the model id', () => {
  const groups = groupCatalogModels([
    { id: 'gpt-5.1-codex[low]', name: 'GPT-5.1 Codex (low)' },
    { id: 'gpt-5.1-codex[medium]', name: 'GPT-5.1 Codex (medium)' },
    { id: 'gpt-5.1-codex[high]', name: 'GPT-5.1 Codex (high)' },
    { id: 'gpt-5.1-codex[xhigh]', name: 'GPT-5.1 Codex (xhigh)' },
    { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking' },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    value: 'catalog-base:gpt-5.1-codex',
    baseId: 'gpt-5.1-codex',
    label: 'GPT-5.1 Codex',
    grouped: true,
    efforts: [
      { level: 'medium', modelId: 'gpt-5.1-codex[medium]', label: 'Medium' },
      { level: 'high', modelId: 'gpt-5.1-codex[high]', label: 'High' },
      { level: 'xhigh', modelId: 'gpt-5.1-codex[xhigh]', label: 'XHigh' },
      { level: 'low', modelId: 'gpt-5.1-codex[low]', label: 'Low' },
    ],
  });
  assert.deepEqual(groups[1], {
    value: 'catalog:kimi-k2-thinking',
    baseId: 'kimi-k2-thinking',
    label: 'Kimi K2 Thinking',
    grouped: false,
    efforts: [],
  });
});

test('resolves a grouped ACP model selection with the selected Think level', () => {
  const models = [
    { id: 'gpt-5.1-codex[low]', name: 'GPT-5.1 Codex (low)' },
    { id: 'gpt-5.1-codex[high]', name: 'GPT-5.1 Codex (high)' },
    { id: 'gpt-5.1-codex[xhigh]', name: 'GPT-5.1 Codex (xhigh)' },
  ];

  assert.equal(resolveCatalogModelSelection('catalog-base:gpt-5.1-codex', 'high', models), 'catalog:gpt-5.1-codex[high]');
  assert.equal(resolveCatalogModelSelection('catalog-base:gpt-5.1-codex', 'xhigh', models), 'catalog:gpt-5.1-codex[xhigh]');
  assert.equal(
    resolveCatalogModelSelection('catalog-base:gpt-5.1-codex', 'auto', models, 'gpt-5.1-codex[low]'),
    'catalog:gpt-5.1-codex[low]',
  );
});

test('limits Think options to the selected grouped model efforts', () => {
  const models = [
    { id: 'model-a[low]', name: 'Model A (low)' },
    { id: 'model-a[high]', name: 'Model A (high)' },
    { id: 'model-a[xhigh]', name: 'Model A (xhigh)' },
    { id: 'model-b[medium]', name: 'Model B (medium)' },
  ];

  assert.deepEqual(reasoningOptionsForModel('catalog-base:model-a', models), [
    { value: 'auto', label: 'Auto' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'XHigh' },
    { value: 'low', label: 'Low' },
  ]);
});

test('describes grouped ACP current model ids without duplicating raw effort syntax', () => {
  assert.equal(
    describeCatalogModelId('gpt-5.1-codex[high]', [{ id: 'gpt-5.1-codex[high]', name: 'GPT-5.1 Codex (high)' }]),
    'GPT-5.1 Codex · High',
  );
  assert.equal(
    describeCatalogModelId('gpt-5.1-codex[xhigh]', [{ id: 'gpt-5.1-codex[xhigh]', name: 'GPT-5.1 Codex (xhigh)' }]),
    'GPT-5.1 Codex · XHigh',
  );
});
