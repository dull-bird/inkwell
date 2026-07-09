import { createRoot } from 'react-dom/client';
import App from './App';
import { createNativeSidePanelElectronApi } from './nativeAgentHostApi';
import { createBrowserPreviewElectronApi } from './devElectronApi';
import { isNativeSidePanelSurface } from './nativeSidePanel';
import './index.css';

if (isNativeSidePanelSurface() && !window.electronAPI) {
  window.electronAPI = createNativeSidePanelElectronApi();
} else if (import.meta.env.DEV && !window.electronAPI) {
  window.electronAPI = createBrowserPreviewElectronApi();
}

createRoot(document.getElementById('root')!).render(<App />);
