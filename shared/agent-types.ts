import type { NativePdfCoreStatus } from './native-pdf-core';
import type { NativePdfCommandName } from './native-pdf-commands';

// Types shared between Electron main process (electron/agent.ts,
// electron/preload.ts) and renderer (src/). Kept dependency-free so
// renderer's TypeScript program never needs resolve main-process-only
// packages (electron, @mcpc-tech/acp-ai-provider, ai, zod) just to know the
// shape of values.

export type AgentEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'file-output'; path: string }
  | { type: 'aborted' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type AgentKind = 'claude' | 'codex' | 'kimi';
export type AgentReasoningLevel = 'auto' | 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export interface AgentModelOption {
  id: string;
  name: string;
}

export interface AgentModeOption {
  id: string;
  name: string;
}

export interface AgentCatalog {
  models: AgentModelOption[];
  modes: AgentModeOption[];
  currentModelId?: string;
  currentModeId?: string;
  unavailableReason?: string;
}

export interface AgentPromptOptions {
  modelId?: string;
  modeId?: string;
  reasoningLevel?: AgentReasoningLevel;
}

export type PdfSessionExportMode = 'none' | 'reference' | 'copy';

export interface NativeAgentSessionExportRequest {
  suggestedName: string;
  handoffMarkdown: string;
  notesMarkdown: string;
  nextPrompt: string;
  activePdfPath?: string | null;
  hasUnsavedPreviewOperations: boolean;
}

export interface NativeAgentSessionExportResult {
  directory: string;
  handoffPath: string;
  notesPath: string;
  promptPath: string;
  pdfMode: PdfSessionExportMode;
  pdfPath?: string;
}

export const AGENT_INFO: Record<AgentKind, { label: string; color: string }> = {
  claude: { label: 'Claude Code', color: '#D97757' },
  codex: { label: 'Codex', color: '#10A37F' },
  kimi: { label: 'Kimi Code', color: '#6D5BD0' },
};

export interface ElectronAPI {
  openPdfFile: () => Promise<string | null>;
  openPdfFolder: () => Promise<string[]>;
  getBackendUrl: () => Promise<string>;
  getBackendToken: () => Promise<string>;
  setCurrentFile: (path: string) => Promise<void>;
  openPath: (path: string) => Promise<string>;
  openNativeShell: (path?: string) => Promise<string>;
  getNativePdfCoreStatus: () => Promise<NativePdfCoreStatus>;
  runNativePdfCommand: (method: NativePdfCommandName, params?: Record<string, unknown>) => Promise<unknown>;
  exportNativeAgentSession: (
    request: NativeAgentSessionExportRequest,
  ) => Promise<NativeAgentSessionExportResult>;
  getAgentKind: () => Promise<AgentKind>;
  setAgentKind: (kind: AgentKind) => Promise<void>;
  getAgentCatalog: (kind: AgentKind) => Promise<AgentCatalog>;
  sendAgentPrompt: (prompt: string, turnId: string, options?: AgentPromptOptions) => void;
  stopAgentPrompt: (turnId: string) => void;
  onAgentEvent: (callback: (event: AgentEvent & { turnId?: string }) => void) => () => void;
}
