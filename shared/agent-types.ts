// Types shared between the Electron main process (electron/agent.ts,
// electron/preload.ts) and the renderer (src/). Kept dependency-free so the
// renderer's TypeScript program never needs to resolve main-process-only
// packages (electron, @mcpc-tech/acp-ai-provider, ai, zod) just to know the
// shape of these values.

export type AgentEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'file-output'; path: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type AgentKind = 'claude' | 'codex' | 'kimi';

export const AGENT_INFO: Record<AgentKind, { label: string; color: string }> = {
  claude: { label: 'Claude Code', color: '#D97757' },
  codex: { label: 'Codex', color: '#10A37F' },
  kimi: { label: 'Kimi Code', color: '#6D5BD0' },
};

export interface ElectronAPI {
  openPdfFile: () => Promise<string | null>;
  getBackendUrl: () => Promise<string>;
  getBackendToken: () => Promise<string>;
  setCurrentFile: (path: string) => Promise<void>;
  getAgentKind: () => Promise<AgentKind>;
  setAgentKind: (kind: AgentKind) => Promise<void>;
  sendAgentPrompt: (prompt: string) => void;
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void;
}
