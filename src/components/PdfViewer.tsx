import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

export interface PdfRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface HighlightOperation {
  id: string;
  page: number;
  rects: PdfRect[];
  color: [number, number, number];
  opacity?: number;
  text?: string;
}

export interface CommentTarget {
  page: number;
  x: number;
  y: number;
}

interface PdfViewerProps {
  path: string;
}

export default function PdfViewer({ path }: PdfViewerProps) {
  const [status, setStatus] = useState<string | null>(null);

  const openNativeShell = async () => {
    setStatus('Opening native PDF4QT shell...');
    try {
      const shellPath = await window.electronAPI.openNativeShell(path);
      setStatus(`Opened in native shell: ${shellPath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="pdf-viewer native-surface-handoff">
      <div className="native-surface-panel">
        <div>
          <div className="section-title">PDF Surface</div>
          <h2>Open this document in the native PDF4QT shell</h2>
          <p>
            Inkwell's target PDF viewer/editor is the Qt/PDF4QT native shell. React should host workflow and
            agent UI, not draw a parallel PDF view.
          </p>
        </div>
        <button className="primary-button" onClick={() => void openNativeShell()}>
          <ExternalLink size={16} />
          Open Native Shell
        </button>
        <div className="native-surface-path">{path}</div>
        {status ? <div className="native-surface-status">{status}</div> : null}
      </div>
    </div>
  );
}
