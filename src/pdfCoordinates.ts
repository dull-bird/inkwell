export interface ClientPoint {
  clientX: number;
  clientY: number;
}

export interface PageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfPoint {
  x: number;
  y: number;
}

export function clientPointToPdfPoint(point: ClientPoint, pageBox: PageBox, scale: number): PdfPoint {
  const pdfWidth = pageBox.width / scale;
  const pdfHeight = pageBox.height / scale;
  return {
    x: clamp((point.clientX - pageBox.left) / scale, 0, pdfWidth),
    y: clamp((point.clientY - pageBox.top) / scale, 0, pdfHeight),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
