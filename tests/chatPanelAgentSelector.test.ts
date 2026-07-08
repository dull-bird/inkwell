import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/components/ChatPanel.tsx'), 'utf8');

test('allows switching agents even when AI for the current PDF is disabled', () => {
  assert.match(source, /if \(kind === agentKind \|\| busy\) return;/);
  assert.doesNotMatch(source, /if \(kind === agentKind \|\| busy \|\| !aiEnabled\) return;/);
  assert.match(source, /<select value={agentKind} disabled={busy}/);
  assert.doesNotMatch(source, /<select value={agentKind} disabled={busy \|\| !aiEnabled}/);
});

test('allows choosing model mode and thinking before AI is enabled', () => {
  assert.match(source, /value=\{modelSelection\}[\s\S]*?disabled=\{busy\}/);
  assert.match(source, /value=\{modeSelection\}[\s\S]*?disabled=\{busy\}/);
  assert.match(source, /value=\{reasoningLevel\}[\s\S]*?disabled=\{busy\}/);
});

test('exposes always-on permission switch in the right AI card', () => {
  assert.match(source, /onPrivacyModeChange\('always'\)/);
  assert.match(source, />\s*Always on\s*</);
  assert.match(source, /onPrivacyModeChange\('manual'\)/);
});
