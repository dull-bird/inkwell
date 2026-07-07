import type { AiPermissionMode } from './privacy';

export interface ChatTranscriptMessage {
  role: 'user' | 'agent' | 'error';
  text: string;
}

export interface SessionExportDocument {
  title: string;
  path: string;
  pageCount?: number;
  analysisLabel?: string;
  analysisSummary?: string;
  previewHighlightCount: number;
}

export interface NativeAgentHandoffInput {
  appName: string;
  exportedAt: string;
  activeDocument: SessionExportDocument | null;
  documents: SessionExportDocument[];
  workspacePaths: string[];
  notesMarkdown: string;
  transcript: ChatTranscriptMessage[];
  aiPermissionMode: AiPermissionMode;
}

export interface NativeAgentNextPromptInput {
  activePdfPath?: string;
  notesPath: string;
  handoffPath: string;
}

export function normalizeSessionNotes(notesMarkdown: string): string {
  const trimmed = notesMarkdown.trim();
  return trimmed.length > 0 ? trimmed : '_No session notes written yet._';
}

export function buildNativeAgentNextPrompt({
  activePdfPath,
  notesPath,
  handoffPath,
}: NativeAgentNextPromptInput): string {
  const pdfSentence = activePdfPath
    ? `The current PDF is \`${activePdfPath}\`.`
    : 'There is no active PDF in this export.';
  return [
    'You are continuing an editing session exported from Sparrow.',
    `Read \`${handoffPath}\` first to recover the Sparrow PDF editing context.`,
    pdfSentence,
    `The session notes are in \`${notesPath}\`.`,
    'Continue from the user intent in the handoff and ask before modifying source files.',
  ].join(' ');
}

export function buildNativeAgentHandoffMarkdown(input: NativeAgentHandoffInput): string {
  const active = input.activeDocument;
  const notes = normalizeSessionNotes(input.notesMarkdown);
  const totalPreviewHighlights = input.documents.reduce(
    (sum, document) => sum + document.previewHighlightCount,
    0,
  );

  return [
    `# ${input.appName} Native Agent Handoff`,
    '',
    `Exported: ${input.exportedAt}`,
    `AI permission mode in Sparrow: \`${input.aiPermissionMode}\``,
    '',
    '## Active Document',
    '',
    active
      ? [
          `- Active PDF: \`${active.path}\``,
          `- Title: ${active.title}`,
          active.pageCount ? `- Pages: ${active.pageCount}` : '- Pages: unknown',
          `- Type: ${active.analysisLabel ?? 'Not analyzed'}`,
          `- Summary: ${active.analysisSummary ?? 'No local analysis was run.'}`,
          `- Unsaved preview annotations: ${active.previewHighlightCount}`,
        ].join('\n')
      : '- No active PDF.',
    '',
    '## Workspace Files',
    '',
    formatList(input.workspacePaths),
    '',
    '## Open PDF Documents',
    '',
    formatDocumentList(input.documents),
    '',
    '## Session Notes',
    '',
    notes,
    '',
    '## Chat Transcript',
    '',
    formatTranscript(input.transcript),
    '',
    '## Continue In Native Agent',
    '',
    buildNativeAgentNextPrompt({
      activePdfPath: active?.path,
      notesPath: './notes.md',
      handoffPath: './handoff.md',
    }),
    '',
    totalPreviewHighlights > 0
      ? 'Important: preview annotations listed above were visible in Sparrow but not necessarily written into the PDF. Apply/save them in Sparrow before treating them as persisted PDF edits.'
      : 'No unsaved preview annotations were reported by Sparrow.',
    '',
  ].join('\n');
}

function formatList(paths: string[]): string {
  if (paths.length === 0) return '- No workspace files.';
  return paths.map((path) => `- \`${path}\``).join('\n');
}

function formatDocumentList(documents: SessionExportDocument[]): string {
  if (documents.length === 0) return '- No open PDF documents.';
  return documents
    .map((document) => {
      const details = [
        document.pageCount ? `${document.pageCount} pages` : 'page count unknown',
        `${document.previewHighlightCount} unsaved preview annotations`,
      ].join(', ');
      return `- ${document.title}: \`${document.path}\` (${details})`;
    })
    .join('\n');
}

function formatTranscript(transcript: ChatTranscriptMessage[]): string {
  if (transcript.length === 0) return '_No chat messages yet._';
  return transcript
    .map((message) => `**${message.role}**: ${message.text.trim() || '_empty_'}`)
    .join('\n\n');
}
