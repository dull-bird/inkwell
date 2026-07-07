import test from 'node:test';
import assert from 'node:assert/strict';
import { clientPointToPdfPoint } from '../src/pdfCoordinates';

test('converts rendered page click point to PDF point using scale', () => {
  assert.deepEqual(
    clientPointToPdfPoint(
      { clientX: 250, clientY: 180 },
      { left: 50, top: 30, width: 595 * 2, height: 842 * 2 },
      2,
    ),
    { x: 100, y: 75 },
  );
});

test('clamps PDF point to page bounds', () => {
  assert.deepEqual(
    clientPointToPdfPoint(
      { clientX: -10, clientY: 9999 },
      { left: 50, top: 30, width: 595, height: 842 },
      1,
    ),
    { x: 0, y: 842 },
  );
});
