export type PdfPlacementMode =
  | 'none'
  | 'comment'
  | 'free-text'
  | 'stamp'
  | 'shape'
  | 'image'
  | 'signature'
  | 'image-signature';

const PLACEMENT_LABELS: Record<Exclude<PdfPlacementMode, 'none'>, string> = {
  comment: 'comment',
  'free-text': 'free text',
  stamp: 'stamp',
  shape: 'shape',
  image: 'image',
  signature: 'signature',
  'image-signature': 'image signature',
};

export function isPdfPlacementActive(mode: PdfPlacementMode): boolean {
  return mode !== 'none';
}

export function pdfPlacementLabel(mode: PdfPlacementMode): string {
  return mode === 'none' ? 'PDF position' : PLACEMENT_LABELS[mode];
}

export function pdfPlacementPrompt(mode: PdfPlacementMode): string {
  return mode === 'none'
    ? 'Select an annotation or signing tool before choosing a position.'
    : `Click a PDF page to choose ${PLACEMENT_LABELS[mode]} position.`;
}
