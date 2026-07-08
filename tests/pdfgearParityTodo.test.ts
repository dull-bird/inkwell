import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const todo = readFileSync(resolve('docs/roadmap/pdfgear-parity-todo.md'), 'utf8');

test('keeps OCR explicitly deferred as a future parity track', () => {
  assert.match(todo, /OCR is intentionally deferred/);
  assert.match(todo, /Future OCR:/);
});

test('tracks the seven non-OCR PDFGear parity workstreams', () => {
  for (const heading of [
    'PDF4QT Native Core',
    'Format Conversion',
    'Direct Content Editing',
    'Page Organization',
    'Signing And Forms',
    'AI Agent Productization',
    'Production Packaging',
  ]) {
    assert.match(todo, new RegExp(`## \\d+\\. ${heading}`));
  }
});

test('requires user-visible agent PDF edits to open result files', () => {
  assert.match(todo, /Prefer one-step tools for user-visible PDF edits, then open the resulting PDF/);
  assert.match(todo, /preview-only tools/);
});

