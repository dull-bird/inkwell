import type { AgentEvent, AgentKind, ElectronAPI } from '../shared/agent-types';

type AgentListener = (event: AgentEvent & { turnId?: string }) => void;

export function createBrowserPreviewElectronApi(): ElectronAPI {
  let agentKind: AgentKind = 'claude';
  const listeners = new Set<AgentListener>();
  const emit = (event: AgentEvent & { turnId?: string }) => {
    for (const listener of listeners) listener(event);
  };

  return {
    openPdfFile: async () => null,
    openPdfFolder: async () => [],
    getBackendUrl: async () => 'http://127.0.0.1:8000',
    getBackendToken: async () => '',
    setCurrentFile: async () => {},
    openPath: async (path) => path,
    getNativePdfCoreStatus: async () => ({
      mode: 'pdfjs-fallback',
      renderer: 'pdf.js',
      writeEngine: 'PyMuPDF',
      pdf4qt: { available: false, envVar: 'INKWELL_PDF4QT_HOST' },
      message: 'PDF4QT host not configured. Set INKWELL_PDF4QT_HOST to test the native core bridge.',
    }),
    exportNativeAgentSession: async () => ({
      directory: '/tmp/sparrow-agent-export',
      handoffPath: '/tmp/sparrow-agent-export/handoff.md',
      notesPath: '/tmp/sparrow-agent-export/notes.md',
      promptPath: '/tmp/sparrow-agent-export/next-prompt.txt',
      pdfMode: 'none',
    }),
    getAgentKind: async () => agentKind,
    setAgentKind: async (kind) => {
      agentKind = kind;
    },
    sendAgentPrompt: (_prompt, turnId) => {
      queueMicrotask(() => {
        emit({
          type: 'text-delta',
          text: 'Browser preview mode. Launch Electron to use a real ACP agent.',
          turnId,
        });
        emit({ type: 'done', turnId });
      });
    },
    stopAgentPrompt: (turnId) => {
      emit({ type: 'aborted', turnId });
    },
    onAgentEvent: (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}
