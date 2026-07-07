import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentPageRanges, splitPdfPageRangesSchema } from '../electron/agentSplitRanges';

test('uses object page ranges instead of tuple schemas for ACP compatibility', () => {
  const parsed = splitPdfPageRangesSchema.parse([{ start: 2, end: 5 }]);
  assert.deepEqual(normalizeAgentPageRanges(parsed), [
    [2, 5],
  ]);
});

test('rejects reversed page ranges before calling the backend', () => {
  assert.throws(() => normalizeAgentPageRanges([{ start: 5, end: 2 }]), /start must be <= end/);
});
