const DEFAULT_TOOL_MARKER = 'acp-ai-sdk-tools__';

export interface InkwellToolEvent {
  toolCallId: string;
  toolName: string;
  args: unknown;
  output: unknown;
}

export function extractInkwellToolEvent(
  part: unknown,
  marker = DEFAULT_TOOL_MARKER,
): InkwellToolEvent | null {
  if (!isRecord(part)) return null;

  const input = isRecord(part.input) ? part.input : null;
  const realName = firstString(input?.toolName, part.toolName, part.name);
  if (!realName) return null;

  const markerIndex = realName.indexOf(marker);
  if (markerIndex === -1) return null;

  const toolCallId = firstString(part.toolCallId, part.id);
  if (!toolCallId) return null;

  return {
    toolCallId,
    toolName: realName.slice(markerIndex + marker.length),
    args: input?.args ?? input?.arguments ?? part.args,
    output: part.output,
  };
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
