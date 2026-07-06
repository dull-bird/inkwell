import { useCallback, useRef, useState } from 'react';
import {
  PdfLoader,
  PdfHighlighter,
  TextHighlight,
  AreaHighlight,
  useHighlightContainerContext,
  usePdfHighlighterContext,
  type Highlight,
  type PdfHighlighterUtils,
  type LTWHP,
} from 'react-pdf-highlighter-plus';
import 'react-pdf-highlighter-plus/style/style.css';

interface PdfViewerProps {
  url: string;
  token: string;
  highlights: Highlight[];
  onHighlightsChange: (highlights: Highlight[]) => void;
}

export default function PdfViewer({ url, token, highlights, onHighlightsChange }: PdfViewerProps) {
  const [scale, setScale] = useState<number>(1);
  const utilsRef = useRef<PdfHighlighterUtils | null>(null);

  const deleteHighlight = useCallback(
    (id: string) => onHighlightsChange(highlights.filter((h) => h.id !== id)),
    [highlights, onHighlightsChange],
  );

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, background: '#fff', borderBottom: '1px solid #ddd' }}>
        <button onClick={() => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2)))}>-</button>
        <span style={{ margin: '0 12px' }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(2)))}>+</button>
        <span style={{ marginLeft: 16, color: '#999', fontSize: 12 }}>
          Select text to highlight &middot; Alt+drag for an area highlight
        </span>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <PdfLoader document={url} httpHeaders={{ 'X-Inkwell-Token': token }}>
          {(pdfDocument) => (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              highlights={highlights}
              pdfScaleValue={scale}
              onZoomChange={setScale}
              enableAreaSelection={(event) => event.altKey}
              utilsRef={(utils) => (utilsRef.current = utils)}
              selectionTip={<AddHighlightTip onAdd={(h) => onHighlightsChange([h, ...highlights])} />}
            >
              <HighlightContainer highlights={highlights} onChange={onHighlightsChange} onDelete={deleteHighlight} />
            </PdfHighlighter>
          )}
        </PdfLoader>
      </div>
    </div>
  );
}

function AddHighlightTip({ onAdd }: { onAdd: (highlight: Highlight) => void }) {
  const { getCurrentSelection, setTip } = usePdfHighlighterContext();

  const confirm = () => {
    const selection = getCurrentSelection();
    if (!selection) return;
    const ghost = selection.makeGhostHighlight();
    onAdd({ id: crypto.randomUUID(), ...ghost });
    setTip(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <button
      onClick={confirm}
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid #ccc',
        background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        cursor: 'pointer',
      }}
    >
      + Highlight
    </button>
  );
}

interface HighlightContainerProps {
  highlights: Highlight[];
  onChange: (highlights: Highlight[]) => void;
  onDelete: (id: string) => void;
}

function HighlightContainer({ highlights, onChange, onDelete }: HighlightContainerProps) {
  const { highlight, isScrolledTo, viewportToScaled } = useHighlightContainerContext();

  if (highlight.type === 'area') {
    const handleAreaChange = (rect: LTWHP) => {
      const scaled = viewportToScaled(rect);
      onChange(
        highlights.map((h) =>
          h.id === highlight.id
            ? { ...h, position: { ...h.position, boundingRect: scaled, rects: [] } }
            : h,
        ),
      );
    };

    return (
      <AreaHighlight
        highlight={highlight as any}
        isScrolledTo={isScrolledTo}
        onChange={handleAreaChange}
        onDelete={() => onDelete(highlight.id)}
      />
    );
  }

  return (
    <TextHighlight
      highlight={highlight as any}
      isScrolledTo={isScrolledTo}
      onDelete={() => onDelete(highlight.id)}
    />
  );
}
