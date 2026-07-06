import { contextBridge, ipcRenderer } from 'electron';
import type { AgentEvent, AgentKind } from './agent.js';

export type { AgentEvent, AgentKind };

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

const api: ElectronAPI = {
  openPdfFile: () => ipcRenderer.invoke('dialog:openFile'),
  getBackendUrl: () => ipcRenderer.invoke('app:getBackendUrl'),
  getBackendToken: () => ipcRenderer.invoke('app:getBackendToken'),
  setCurrentFile: (path) => ipcRenderer.invoke('app:setCurrentFile', path),
  getAgentKind: () => ipcRenderer.invoke('agent:getKind'),
  setAgentKind: (kind) => ipcRenderer.invoke('agent:setKind', kind),
  sendAgentPrompt: (prompt) => ipcRenderer.send('agent:prompt', prompt),
  onAgentEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, agentEvent: AgentEvent) => callback(agentEvent);
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
