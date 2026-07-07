import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowJumpToLatest, shouldStickToBottom } from '../src/chatScroll';

test('keeps streaming chat pinned when user is already near the latest message', () => {
  const state = { scrollHeight: 1000, scrollTop: 728, clientHeight: 240 };
  assert.equal(shouldStickToBottom(state), true);
  assert.equal(shouldShowJumpToLatest(state), false);
});

test('does not yank the chat to the bottom after the user scrolls up', () => {
  const state = { scrollHeight: 1000, scrollTop: 200, clientHeight: 240 };
  assert.equal(shouldStickToBottom(state), false);
  assert.equal(shouldShowJumpToLatest(state), true);
});
