import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleScrollToBottom, shouldShowJumpToLatest, shouldStickToBottom } from '../src/chatScroll';

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

test('schedules scroll after message DOM has had a chance to grow', () => {
  const calls: Array<() => void> = [];
  const element = { scrollHeight: 1600, scrollTop: 0 };
  scheduleScrollToBottom(element, (callback) => calls.push(callback));

  assert.equal(element.scrollTop, 0);
  calls[0]();
  assert.equal(element.scrollTop, 1600);
});
