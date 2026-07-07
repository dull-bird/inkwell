import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNativeAgentHandoffMarkdown,
  buildNativeAgentNextPrompt,
  normalizeSessionNotes,
  type ChatTranscriptMessage,
} from '../src/sessionExport';

const transcript: ChatTranscriptMessage[] = [
  { role: 'user', text: '请总结这份 PDF' },
  { role: 'agent', text: '这是一个关于 PDF agent 编辑器的项目。' },
];

test('normalizes empty notes into an explicit placeholder', () => {
  assert.equal(normalizeSessionNotes('   '), '_No session notes written yet._');
});

test('builds a handoff Markdown document for native agents', () => {
  const markdown = buildNativeAgentHandoffMarkdown({
    appName: 'Sparrow',
    exportedAt: '2026-07-08T09:30:00.000Z',
    activeDocument: {
      title: 'paper.pdf',
      path: '/work/paper.pdf',
      pageCount: 12,
      analysisLabel: 'Research Paper',
      analysisSummary: 'Transformer benchmark notes.',
      previewHighlightCount: 3,
    },
    documents: [
      { title: 'paper.pdf', path: '/work/paper.pdf', previewHighlightCount: 3 },
      { title: 'appendix.pdf', path: '/work/appendix.pdf', previewHighlightCount: 0 },
    ],
    workspacePaths: ['/work/paper.pdf', '/work/notes/session.md'],
    notesMarkdown: '# Reading Notes\n\nKeep working on the benchmark section.',
    transcript,
    aiPermissionMode: 'ask',
  });

  assert.match(markdown, /^# Sparrow Native Agent Handoff/m);
  assert.match(markdown, /Active PDF: `\/work\/paper\.pdf`/);
  assert.match(markdown, /Unsaved preview annotations: 3/);
  assert.match(markdown, /# Reading Notes/);
  assert.match(markdown, /\*\*user\*\*: 请总结这份 PDF/);
  assert.match(markdown, /You are continuing an editing session exported from Sparrow/);
});

test('builds a concise next prompt for Claude Code or Codex CLI', () => {
  const prompt = buildNativeAgentNextPrompt({
    activePdfPath: '/work/paper.pdf',
    notesPath: '/exports/notes.md',
    handoffPath: '/exports/handoff.md',
  });

  assert.match(prompt, /Read `\/exports\/handoff\.md`/);
  assert.match(prompt, /current PDF is `\/work\/paper\.pdf`/);
  assert.match(prompt, /notes are in `\/exports\/notes\.md`/);
});
