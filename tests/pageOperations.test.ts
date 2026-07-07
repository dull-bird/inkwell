import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRemainingPageOrder, buildRotationMap } from '../src/pageOperations';

test('builds remaining page order after deleting 1-based ranges', () => {
  assert.deepEqual(buildRemainingPageOrder(6, [[2, 3], [5, 5]]), [0, 3, 5]);
});

test('rejects deleting every page', () => {
  assert.throws(() => buildRemainingPageOrder(2, [[1, 2]]), /Cannot delete every page/);
});

test('builds absolute rotation map for selected 1-based ranges', () => {
  assert.deepEqual(buildRotationMap(5, [[1, 2], [5, 5]], 90), {
    0: 90,
    1: 90,
    4: 90,
  });
});

test('rejects invalid page ranges', () => {
  assert.throws(() => buildRotationMap(3, [[0, 1]], 90), /Invalid page range/);
  assert.throws(() => buildRemainingPageOrder(3, [[3, 2]]), /Invalid page range/);
});
