import { useCallback, useState } from 'react';
import type { Highlight } from 'react-pdf-highlighter-plus';
import PdfViewer from './components/PdfViewer';
import ChatPanel from './components/ChatPanel';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [agentOutput, setAgentOutput] = useState<string | null>(null);

  const loadPdf = useCallback(async (path: string) => {
    const [backendUrl, backendToken] = await Promise.all([
      window.electronAPI.getBackendUrl(),
      window.electronAPI.getBackendToken(),
    ]);
    // Load PDF through backend so the agent can operate on the same file path.
    const url = `${backendUrl}/pdf?path=${encodeURIComponent(path)}`;
    await window.electronAPI.setCurrentFile(path);
    setToken(backendToken);
    setHighlights([]);
    setPdfUrl(url);
    setAgentOutput(null);
  }, []);

  const handleOpenFile = async () => {
    const path = await window.electronAPI.openPdfFile();
    if (!path) return;
    await loadPdf(path);
  };

  const handleFileOutput = useCallback((path: string) => {
    setAgentOutput(path);
  }, []);

  return (
    <ErrorBoundary>
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: 8, borderBottom: '1px solid #ddd', background: '#fff', display: 'flex', alignItems: 'center' }}>
          <button onClick={handleOpenFile}>Open PDF</button>
          {pdfUrl && <span style={{ marginLeft: 12, color: '#666' }}>Loaded</span>}
          {agentOutput && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#666', fontSize: 13 }}>Agent produced {agentOutput.split('/').pop()}</span>
              <button onClick={() => loadPdf(agentOutput)}>Open result</button>
            </span>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {pdfUrl && token ? (
            <PdfViewer url={pdfUrl} token={token} highlights={highlights} onHighlightsChange={setHighlights} />
          ) : (
            <EmptyState onOpen={handleOpenFile} />
          )}
        </div>
      </div>
      <ChatPanel onFileOutput={handleFileOutput} />
    </div>
    </ErrorBoundary>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ textAlign: 'center', color: '#666' }}>
        <h2>Inkwell</h2>
        <p>Open a PDF to start reading and editing with AI.</p>
        <button onClick={onOpen} style={{ marginTop: 16 }}>Open PDF</button>
      </div>
    </div>
  );
}
