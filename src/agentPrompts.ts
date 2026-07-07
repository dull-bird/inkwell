export function buildSemanticHeadingHighlightPrompt(documentTitle: string): string {
  return [
    `Analyze "${documentTitle}" and highlight the real semantic headings in the current PDF.`,
    'Use read_pdf_text first to understand the document structure.',
    'Decide which lines are human-meaningful headings, chapter titles, section titles, or major form sections.',
    'For each selected heading, call find_pdf_text with the exact heading text so Sparrow can preview highlights in the viewer.',
    'Do not save, export, or apply a new PDF unless the user explicitly asks for that.',
    'After the tool calls, briefly explain what heading groups you highlighted.',
  ].join('\n');
}
