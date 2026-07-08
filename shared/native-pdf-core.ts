export const PDF4QT_HOST_ENV = 'INKWELL_PDF4QT_HOST';

export type NativePdfCoreMode = 'pdfjs-fallback' | 'pdf4qt-missing' | 'pdf4qt-ready';

export interface NativePdfCoreStatus {
  mode: NativePdfCoreMode;
  renderer: 'pdf.js';
  writeEngine: 'PyMuPDF';
  pdf4qt: {
    available: boolean;
    envVar: typeof PDF4QT_HOST_ENV;
    hostPath?: string;
  };
  message: string;
}

export interface NativePdfCoreProbe {
  hostPath?: string;
  hostExists: boolean;
}

export function resolveNativePdfCoreStatus({
  hostPath,
  hostExists,
}: NativePdfCoreProbe): NativePdfCoreStatus {
  if (hostPath && hostExists) {
    return {
      mode: 'pdf4qt-ready',
      renderer: 'pdf.js',
      writeEngine: 'PyMuPDF',
      pdf4qt: {
        available: true,
        envVar: PDF4QT_HOST_ENV,
        hostPath,
      },
      message: 'PDF4QT native command bridge ready.',
    };
  }

  if (hostPath && !hostExists) {
    return {
      mode: 'pdf4qt-missing',
      renderer: 'pdf.js',
      writeEngine: 'PyMuPDF',
      pdf4qt: {
        available: false,
        envVar: PDF4QT_HOST_ENV,
        hostPath,
      },
      message: `PDF4QT host configured but unavailable: ${hostPath}`,
    };
  }

  return {
    mode: 'pdfjs-fallback',
    renderer: 'pdf.js',
    writeEngine: 'PyMuPDF',
    pdf4qt: {
      available: false,
      envVar: PDF4QT_HOST_ENV,
    },
    message: `PDF4QT host not configured. Set ${PDF4QT_HOST_ENV} to test the native core bridge.`,
  };
}

export function nativePdfCoreStatusSummary(status: NativePdfCoreStatus): string {
  const nativeCore = status.pdf4qt.available ? 'PDF4QT' : 'not active';
  return `${status.message} Viewer: ${status.renderer}. PDF writes: ${status.writeEngine}. Native core: ${nativeCore}.`;
}
