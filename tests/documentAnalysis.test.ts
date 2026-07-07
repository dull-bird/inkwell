import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDocumentText } from '../src/documentAnalysis';

test('classifies academic papers and suggests research actions', () => {
  const analysis = analyzeDocumentText(
    [
      'Abstract',
      'We propose a transformer method for PDF understanding.',
      'Keywords: retrieval augmented generation, document AI',
      '1 Introduction',
      'References',
      'doi:10.1145/example',
    ].join('\n'),
  );

  assert.equal(analysis.kind, 'academic-paper');
  assert.ok(analysis.confidence >= 0.7);
  assert.ok(analysis.suggestions.some((suggestion) => suggestion.id === 'search-related-papers'));
  assert.ok(analysis.suggestions.some((suggestion) => suggestion.id === 'highlight-key-claims'));
});

test('separates school textbooks from university textbooks', () => {
  const school = analyzeDocumentText('Chapter 3 Fractions\nExample 1\nPractice\nExercises\nGrade 6 Mathematics');
  const university = analyzeDocumentText('Chapter 5 Linear Operators\nTheorem 5.1\nProof.\nProblem Set\nHilbert space');

  assert.equal(school.kind, 'school-textbook');
  assert.equal(university.kind, 'university-textbook');
  assert.ok(school.suggestions.some((suggestion) => suggestion.id === 'make-study-plan'));
  assert.ok(university.suggestions.some((suggestion) => suggestion.id === 'extract-theorems'));
});

test('classifies contracts and suggests review actions', () => {
  const analysis = analyzeDocumentText(
    'This Agreement is made by and between the parties. Effective Date. Termination. Governing Law. Confidentiality.',
  );

  assert.equal(analysis.kind, 'contract');
  assert.ok(analysis.suggestions.some((suggestion) => suggestion.id === 'extract-obligations'));
});

test('falls back to general document with practical suggestions', () => {
  const analysis = analyzeDocumentText('A short note about lunch planning and a few reminders.');

  assert.equal(analysis.kind, 'general');
  assert.ok(analysis.suggestions.some((suggestion) => suggestion.id === 'summarize'));
});
