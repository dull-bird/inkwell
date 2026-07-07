export function validateAiBrushRun(aiAllowed: boolean, instruction: string): string {
  if (!aiAllowed) throw new Error('Enable AI for this document before using AI brush.');
  const trimmed = instruction.trim();
  if (!trimmed) throw new Error('Brush instruction cannot be empty.');
  return trimmed;
}

export function buildAiBrushPrompt(documentTitle: string, instruction: string): string {
  const trimmed = instruction.trim();
  return [
    `Use experimental AI brush on "${documentTitle}".`,
    `Instruction: ${trimmed}`,
    'Read only the current PDF when needed. Prefer standard PDF annotations.',
    'Preview the result in the current PDF when possible; do not overwrite the original file.',
  ].join('\n');
}
