import { join } from 'node:path';

export const INKWELL_NATIVE_SHELL_ENV = 'INKWELL_NATIVE_SHELL';

export type NativeShellSource = 'environment' | 'bundled' | 'missing';

export interface NativeShellPathResolution {
  source: NativeShellSource;
  available: boolean;
  envVar: typeof INKWELL_NATIVE_SHELL_ENV;
  checkedPaths: string[];
  shellPath?: string;
  message: string;
}

export interface NativeShellPathInput {
  envShellPath?: string | null;
  resourcesPath: string;
  platform: string;
  arch: string;
  exists: (path: string) => boolean;
}

export function getBundledNativeShellPath(resourcesPath: string, platform: string, arch: string): string {
  if (platform === 'darwin') {
    return join(resourcesPath, 'native', 'inkwell-shell', `${platform}-${arch}`, 'inkwell-native-shell.app');
  }
  const executable = platform === 'win32' ? 'inkwell-native-shell.exe' : 'inkwell-native-shell';
  return join(resourcesPath, 'native', 'inkwell-shell', `${platform}-${arch}`, executable);
}

export function resolveNativeShellPath({
  envShellPath,
  resourcesPath,
  platform,
  arch,
  exists,
}: NativeShellPathInput): NativeShellPathResolution {
  const explicitShellPath = envShellPath?.trim();
  if (explicitShellPath) {
    const available = exists(explicitShellPath);
    return {
      source: 'environment',
      available,
      envVar: INKWELL_NATIVE_SHELL_ENV,
      checkedPaths: [explicitShellPath],
      shellPath: explicitShellPath,
      message: available
        ? 'Inkwell native Qt shell ready from environment override.'
        : `Inkwell native shell configured but unavailable: ${explicitShellPath}`,
    };
  }

  const bundledShellPath = getBundledNativeShellPath(resourcesPath, platform, arch);
  const available = exists(bundledShellPath);
  return {
    source: available ? 'bundled' : 'missing',
    available,
    envVar: INKWELL_NATIVE_SHELL_ENV,
    checkedPaths: [bundledShellPath],
    shellPath: available ? bundledShellPath : undefined,
    message: available
      ? 'Inkwell native Qt shell ready from bundled runtime.'
      : `Inkwell native shell not configured. Set ${INKWELL_NATIVE_SHELL_ENV} or run native:shell:stage.`,
  };
}
