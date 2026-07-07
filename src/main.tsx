import { createRoot } from 'react-dom/client';
import App from './App';
import { createBrowserPreviewElectronApi } from './devElectronApi';
import './index.css';

// No StrictMode: react-pdf-highlighter's PdfHighlighter doesn't clean up
// after itself on the double-invoked mount/effect StrictMode does in dev,
// which leaves duplicate, overlapping page layers on screen.
// https://github.com/agentcooper/react-pdf-highlighter/issues/297
if (import.meta.env.DEV && !window.electronAPI) {
  window.electronAPI = createBrowserPreviewElectronApi();
}

createRoot(document.getElementById('root')!).render(<App />);
