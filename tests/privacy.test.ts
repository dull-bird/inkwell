import test from 'node:test';
import assert from 'node:assert/strict';
import { canAutomaticallyAnalyze, getDefaultDocumentAiEnabled, isAiAllowed } from '../src/privacy';

test('keeps AI disabled by default for newly opened documents', () => {
  assert.equal(getDefaultDocumentAiEnabled('manual'), false);
  assert.equal(isAiAllowed('manual', false), false);
  assert.equal(canAutomaticallyAnalyze('manual'), false);
});

test('allows a user to explicitly enable AI for one document', () => {
  assert.equal(isAiAllowed('manual', true), true);
});

test('always-on mode allows agent use but still requires manual analysis', () => {
  assert.equal(getDefaultDocumentAiEnabled('always'), true);
  assert.equal(isAiAllowed('always', false), true);
  assert.equal(canAutomaticallyAnalyze('always'), false);
});
