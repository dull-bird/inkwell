import test from 'node:test';
import assert from 'node:assert/strict';
import { getComposerControlState } from '../src/chatComposerState';

test('keeps both send and stop controls present while idle', () => {
  assert.deepEqual(getComposerControlState({ canChat: true, busy: false, activeTurnId: null, input: 'hello' }), {
    textareaDisabled: false,
    sendVisible: true,
    sendDisabled: false,
    stopVisible: true,
    stopDisabled: true,
  });
});

test('keeps both controls present while streaming and only enables stop', () => {
  assert.deepEqual(getComposerControlState({ canChat: true, busy: true, activeTurnId: 'turn-1', input: '' }), {
    textareaDisabled: false,
    sendVisible: true,
    sendDisabled: true,
    stopVisible: true,
    stopDisabled: false,
  });
});
