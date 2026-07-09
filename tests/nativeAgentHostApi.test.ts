import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSidePanelElectronApi } from '../src/nativeAgentHostApi';

test('native side-panel API routes agent calls through Qt agentHostBridge', async () => {
  const sent: string[] = [];
  const listeners: Array<(raw: string) => void> = [];
  const api = createNativeSidePanelElectronApi({
    getBridge: async () => ({
      getAgentKindJson: async () => JSON.stringify({ kind: 'codex' }),
      setAgentKindJson: async (kind) => {
        sent.push(`kind:${kind}`);
        return JSON.stringify({ ok: true, kind });
      },
      getAgentCatalogJson: async (kind) =>
        JSON.stringify({
          models: [],
          modes: [{ id: 'ask', name: 'Ask' }],
          unavailableReason: `${kind} native bridge test`,
        }),
      sendAgentPromptJson: (prompt, turnId, optionsJson) => {
        sent.push(`prompt:${prompt}:${turnId}:${optionsJson}`);
        listeners.forEach((listener) => listener(JSON.stringify({ type: 'text-delta', text: 'hi', turnId })));
      },
      stopAgentPromptJson: (turnId) => {
        sent.push(`stop:${turnId}`);
        listeners.forEach((listener) => listener(JSON.stringify({ type: 'aborted', turnId })));
      },
      agentEventJson: {
        connect: (listener) => listeners.push(listener),
      },
    }),
  });

  assert.equal(await api.getAgentKind(), 'codex');
  await api.setAgentKind('claude');
  assert.deepEqual(await api.getAgentCatalog('codex'), {
    models: [],
    modes: [{ id: 'ask', name: 'Ask' }],
    unavailableReason: 'codex native bridge test',
  });

  const events: string[] = [];
  api.onAgentEvent((event) => events.push(`${event.type}:${event.turnId ?? ''}:${'text' in event ? event.text : ''}`));
  api.sendAgentPrompt('hello', 't1', { modeId: 'ask' });
  api.stopAgentPrompt('t1');

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(sent, ['kind:claude', 'prompt:hello:t1:{"modeId":"ask"}', 'stop:t1']);
  assert.deepEqual(events, ['text-delta:t1:hi', 'aborted:t1:']);
});

test('native side-panel API reports explicit unavailable agent host', async () => {
  const api = createNativeSidePanelElectronApi({ getBridge: async () => null });
  const events: string[] = [];
  api.onAgentEvent((event) => events.push(`${event.type}:${'message' in event ? event.message : ''}`));

  assert.match((await api.getAgentCatalog('codex')).unavailableReason ?? '', /Native agent bridge/);
  api.sendAgentPrompt('hello', 't2');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(events, ['error:Native agent bridge is not available.', 'done:']);
});
