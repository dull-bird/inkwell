import type { AgentPromptOptions, AgentReasoningLevel } from '../shared/agent-types';

export type AgentModelSelection = 'default' | 'custom';
export type AgentModeSelection = 'default' | 'ask' | 'plan' | 'edit' | 'review';

export function buildAgentPromptOptions(
  modelSelection: AgentModelSelection,
  customModelId: string,
  modeSelection: AgentModeSelection,
  reasoningLevel: AgentReasoningLevel,
): AgentPromptOptions {
  const options: AgentPromptOptions = { reasoningLevel };
  if (modelSelection === 'custom') {
    const trimmedModel = customModelId.trim();
    if (trimmedModel) options.modelId = trimmedModel;
  }
  if (modeSelection !== 'default') options.modeId = modeSelection;
  return options;
}

export function reasoningInstruction(level: AgentReasoningLevel | undefined): string {
  switch (level) {
    case 'low':
      return '[Inkwell: Reasoning intensity requested: low. Prefer fast, direct answers.]';
    case 'medium':
      return '[Inkwell: Reasoning intensity requested: medium. Balance speed with careful checking.]';
    case 'high':
      return '[Inkwell: Reasoning intensity requested: high. Use deep reasoning for document understanding and edits.]';
    default:
      return '';
  }
}
