import test from 'node:test';
import assert from 'node:assert/strict';
import { extractInkwellToolEvent } from '../electron/agentToolEvents';

test('extracts Inkwell tool calls from nested ACP wrapper input', () => {
  const part = {
    type: 'tool-call',
    toolCallId: 'call-1',
    input: {
      toolName: 'mcp__acp-ai-sdk-tools__highlight_pdf_headings',
      args: { opacity: 0.25 },
    },
  };

  assert.deepEqual(extractInkwellToolEvent(part), {
    toolCallId: 'call-1',
    toolName: 'highlight_pdf_headings',
    args: { opacity: 0.25 },
    output: undefined,
  });
});

test('extracts Inkwell tool results when the SDK reports the wrapper name at top level', () => {
  const output = { operations: [] };
  const part = {
    type: 'tool-result',
    toolCallId: 'call-2',
    toolName: 'mcp__acp-ai-sdk-tools__find_pdf_text',
    output,
  };

  assert.deepEqual(extractInkwellToolEvent(part), {
    toolCallId: 'call-2',
    toolName: 'find_pdf_text',
    args: undefined,
    output,
  });
});

test('ignores non-Inkwell agent tool events', () => {
  assert.equal(extractInkwellToolEvent({ toolCallId: 'call-3', toolName: 'Bash' }), null);
});
