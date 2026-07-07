import { useMemo, useState, type MouseEvent } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { clientPointToPdfPoint } from '../pdfCoordinates';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
  url: string;
  token: string;
  highlights: HighlightOperation[];
  commentTarget?: CommentTarget | null;
  onCommentTargetChange?: (target: CommentTarget) => void;
}

export default function PdfViewer({ url, token, highlights, commentTarget, onCommentTargetChange }: PdfViewerProps) {
  const [scale, setScale] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const file = useMemo(() => ({ url }), [url]);
  const options = useMemo(() => ({ httpHeaders: { 'X-Inkwell-Token': token } }), [token]);

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button onClick={() => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(2)))}>-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(2)))}>+</button>
        <span className="pdf-toolbar-status">
          {highlights.length > 0 ? `${highlights.length} preview highlights` : 'Ready'}
        </span>
      </div>
      <div className="pdf-scroll">
        <Document file={file} options={options} onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}>
          {Array.from({ length: numPages }, (_, index) => {
            const pageNumber = index + 1;
            const pageHighlights = highlights.filter((highlight) => highlight.page === index);
            const pageCommentTarget = commentTarget?.page === index ? commentTarget : null;
            const handleClick = (event: MouseEvent<HTMLDivElement>) => {
              const point = clientPointToPdfPoint(event, event.currentTarget.getBoundingClientRect(), scale);
              onCommentTargetChange?.({ page: index, x: point.x, y: point.y });
            };
            return (
              <div className="pdf-page-wrap" key={pageNumber} onClick={handleClick}>
                <Page pageNumber={pageNumber} scale={scale} renderAnnotationLayer renderTextLayer />
                <HighlightOverlay highlights={pageHighlights} scale={scale} />
                {pageCommentTarget && <CommentTargetOverlay target={pageCommentTarget} scale={scale} />}
              </div>
            );
          })}
        </Document>
      </div>
    </div>
  );
}

function CommentTargetOverlay({ target, scale }: { target: CommentTarget; scale: number }) {
  return (
    <div
      className="comment-target"
      style={{
        left: target.x * scale,
        top: target.y * scale,
      }}
      title={`Comment at page ${target.page + 1}, ${Math.round(target.x)}, ${Math.round(target.y)}`}
    >
      小
    </div>
  );
}

function HighlightOverlay({ highlights, scale }: { highlights: HighlightOperation[]; scale: number }) {
  return (
    <div className="highlight-overlay">
      {highlights.flatMap((highlight) =>
        highlight.rects.map((rect, index) => {
          const [r, g, b] = highlight.color;
          return (
            <div
              key={`${highlight.id}-${index}`}
              title={highlight.text}
              className="preview-highlight"
              style={{
                left: rect.x0 * scale,
                top: rect.y0 * scale,
                width: Math.max(1, (rect.x1 - rect.x0) * scale),
                height: Math.max(1, (rect.y1 - rect.y0) * scale),
                background: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${
                  highlight.opacity ?? 0.25
                })`,
              }}
            />
          );
        }),
      )}
    </div>
  );
}
