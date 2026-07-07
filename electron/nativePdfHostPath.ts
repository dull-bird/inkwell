import { join } from 'node:path';

export const PDF4QT_HOST_ENV = 'INKWELL_PDF4QT_HOST';

export type NativePdfHostSource = 'environment' | 'bundled' | 'missing';

export interface NativePdfHostPathResolution {
  source: NativePdfHostSource;
  available: boolean;
  envVar: typeof PDF4QT_HOST_ENV;
  checkedPaths: string[];
  hostPath?: string;
  message: string;
}

export interface NativePdfHostPathInput {
  envHostPath?: string | null;
  resourcesPath: string;
  platform: string;
  arch: string;
  exists: (path: string) => boolean;
}

export function getBundledNativePdfHostPath(resourcesPath: string, platform: string, arch: string): string {
  const executable = platform === 'win32' ? 'inkwell-pdf4qt-host.exe' : 'inkwell-pdf4qt-host';
  return join(resourcesPath, 'native', 'pdf4qt-host', `${platform}-${arch}`, executable);
}

export function resolveNativePdfHostPath({
  envHostPath,
  resourcesPath,
  platform,
  arch,
  exists,
}: NativePdfHostPathInput): NativePdfHostPathResolution {
  const explicitHostPath = envHostPath?.trim();
  if (explicitHostPath) {
    const available = exists(explicitHostPath);
    return {
      source: 'environment',
      available,
      envVar: PDF4QT_HOST_ENV,
      checkedPaths: [explicitHostPath],
      hostPath: explicitHostPath,
      message: available
        ? 'PDF4QT native core ready from environment override.'
        : `PDF4QT host configured but unavailable: ${explicitHostPath}`,
    };
  }

  const bundledHostPath = getBundledNativePdfHostPath(resourcesPath, platform, arch);
  const available = exists(bundledHostPath);
  return {
    source: available ? 'bundled' : 'missing',
    available,
    envVar: PDF4QT_HOST_ENV,
    checkedPaths: [bundledHostPath],
    hostPath: available ? bundledHostPath : undefined,
    message: available
      ? 'PDF4QT native core ready from bundled host.'
      : `PDF4QT host not configured. Set ${PDF4QT_HOST_ENV} or bundle ${bundledHostPath}.`,
  };
}
