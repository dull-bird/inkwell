import test from 'node:test';
import assert from 'node:assert/strict';
import { isPdfPlacementActive, pdfPlacementLabel, pdfPlacementPrompt } from '../src/pdfPlacementMode';

test('keeps PDF clicks passive until a placement tool is selected', () => {
  assert.equal(isPdfPlacementActive('none'), false);
  assert.equal(isPdfPlacementActive('comment'), true);
  assert.equal(isPdfPlacementActive('signature'), true);
  assert.equal(isPdfPlacementActive('image'), true);
  assert.equal(isPdfPlacementActive('image-signature'), true);
});

test('describes the active PDF placement tool', () => {
  assert.equal(pdfPlacementLabel('none'), 'PDF position');
  assert.equal(pdfPlacementLabel('stamp'), 'stamp');
  assert.equal(pdfPlacementLabel('image-signature'), 'image signature');
  assert.match(pdfPlacementPrompt('shape'), /choose shape position/);
});
