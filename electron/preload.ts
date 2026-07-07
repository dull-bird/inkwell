import { contextBridge, ipcRenderer } from 'electron';
import type { AgentEvent, AgentKind, AgentPromptOptions } from './agent.js';

export type { AgentEvent, AgentKind, AgentPromptOptions };

type PdfSessionExportMode = 'none' | 'reference' | 'copy';
type NativePdfCoreMode = 'pdfjs-fallback' | 'pdf4qt-missing' | 'pdf4qt-ready';

interface NativePdfCoreStatus {
  mode: NativePdfCoreMode;
  renderer: 'pdf.js' | 'PDF4QT';
  writeEngine: 'PyMuPDF' | 'PDF4QT command bridge';
  pdf4qt: {
    available: boolean;
    envVar: 'INKWELL_PDF4QT_HOST';
    hostPath?: string;
  };
  message: string;
}

interface NativeAgentSessionExportRequest {
  suggestedName: string;
  handoffMarkdown: string;
  notesMarkdown: string;
  nextPrompt: string;
  activePdfPath?: string | null;
  hasUnsavedPreviewOperations: boolean;
}

interface NativeAgentSessionExportResult {
  directory: string;
  handoffPath: string;
  notesPath: string;
  promptPath: string;
  pdfMode: PdfSessionExportMode;
  pdfPath?: string;
}

export interface ElectronAPI {
  openPdfFile: () => Promise<string | null>;
  openPdfFolder: () => Promise<string[]>;
  getBackendUrl: () => Promise<string>;
  getBackendToken: () => Promise<string>;
  setCurrentFile: (path: string) => Promise<void>;
  openPath: (path: string) => Promise<string>;
  getNativePdfCoreStatus: () => Promise<NativePdfCoreStatus>;
  exportNativeAgentSession: (
    request: NativeAgentSessionExportRequest,
  ) => Promise<NativeAgentSessionExportResult>;
  getAgentKind: () => Promise<AgentKind>;
  setAgentKind: (kind: AgentKind) => Promise<void>;
  sendAgentPrompt: (prompt: string, turnId: string, options?: AgentPromptOptions) => void;
  stopAgentPrompt: (turnId: string) => void;
  onAgentEvent: (callback: (event: AgentEvent & { turnId?: string }) => void) => () => void;
}

const api: ElectronAPI = {
  openPdfFile: () => ipcRenderer.invoke('dialog:openFile'),
  openPdfFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  getBackendUrl: () => ipcRenderer.invoke('app:getBackendUrl'),
  getBackendToken: () => ipcRenderer.invoke('app:getBackendToken'),
  setCurrentFile: (path) => ipcRenderer.invoke('app:setCurrentFile', path),
  openPath: (path) => ipcRenderer.invoke('app:openPath', path),
  getNativePdfCoreStatus: () => ipcRenderer.invoke('app:getNativePdfCoreStatus'),
  exportNativeAgentSession: (request) => ipcRenderer.invoke('session:exportNativeAgent', request),
  getAgentKind: () => ipcRenderer.invoke('agent:getKind'),
  setAgentKind: (kind) => ipcRenderer.invoke('agent:setKind', kind),
  sendAgentPrompt: (prompt, turnId, options) => ipcRenderer.send('agent:prompt', prompt, turnId, options),
  stopAgentPrompt: (turnId) => ipcRenderer.send('agent:stop', turnId),
  onAgentEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, agentEvent: AgentEvent & { turnId?: string }) => callback(agentEvent);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
