import type { ElectronAPI } from '../../shared/agent-types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
