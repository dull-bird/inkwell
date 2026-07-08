import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appCss = readFileSync(resolve('src/index.css'), 'utf8');
const chatCss = readFileSync(resolve('src/components/ChatPanel.css'), 'utf8');

test('keeps app grid children shrinkable so nested panes can scroll', () => {
  assert.match(appCss, /\.sparrow-app\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(appCss, /\.sparrow-sidebar\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(appCss, /\.sparrow-main\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(appCss, /\.agent-shell\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
});

test('keeps sidebar plugin and tools panes independently scrollable', () => {
  assert.match(appCss, /\.sidebar-content\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s);
  assert.match(appCss, /\.tab-strip\s*{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s);
});

test('keeps PDF pages in the viewer scroll container', () => {
  assert.match(appCss, /\.viewer-frame\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(appCss, /\.pdf-viewer\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(appCss, /\.pdf-scroll\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s);
  assert.doesNotMatch(appCss, /\.pdf-page-wrap\s*{[^}]*cursor:\s*crosshair;/s);
  assert.match(appCss, /\.pdf-page-wrap\.picking-target\s*{[^}]*cursor:\s*crosshair;/s);
});

test('keeps chat stream as the only flexible scrolling region in the agent panel', () => {
  assert.match(chatCss, /\.sparrow-agent-panel\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(chatCss, /\.chat-stream-wrap\s*{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(chatCss, /\.chat-scroll\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(chatCss, /\.chat-composer\s*{[^}]*flex:\s*0 0 auto;/s);
});
