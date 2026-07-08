import test from 'node:test';
import assert from 'node:assert/strict';
import { getComposerControlState } from '../src/chatComposerState';

test('shows only send while idle', () => {
  assert.deepEqual(getComposerControlState({ canChat: true, busy: false, activeTurnId: null, input: 'hello' }), {
    textareaDisabled: false,
    sendVisible: true,
    sendDisabled: false,
    stopVisible: false,
    stopDisabled: true,
  });
});

test('turns the send control into stop while streaming', () => {
  assert.deepEqual(getComposerControlState({ canChat: true, busy: true, activeTurnId: 'turn-1', input: '' }), {
    textareaDisabled: false,
    sendVisible: false,
    sendDisabled: true,
    stopVisible: true,
    stopDisabled: false,
  });
});
