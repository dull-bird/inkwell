import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserPreviewElectronApi } from '../src/devElectronApi';

test('browser preview API emits a minimal streamed agent response', async () => {
  const api = createBrowserPreviewElectronApi();
  const events: string[] = [];
  const unsubscribe = api.onAgentEvent((event) => events.push(event.type));

  api.sendAgentPrompt('hello', 'turn-1');
  await new Promise((resolve) => setTimeout(resolve, 0));
  unsubscribe();

  assert.deepEqual(events, ['text-delta', 'done']);
});

test('browser preview API emits aborted when stopped', () => {
  const api = createBrowserPreviewElectronApi();
  const events: string[] = [];
  api.onAgentEvent((event) => events.push(`${event.type}:${event.turnId ?? ''}`));

  api.stopAgentPrompt('turn-2');

  assert.deepEqual(events, ['aborted:turn-2']);
});
