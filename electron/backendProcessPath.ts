import { dirname as pathDirname, join } from 'node:path';
import { existsSync } from 'node:fs';

export const INKWELL_BACKEND_EXECUTABLE_ENV = 'INKWELL_BACKEND_EXECUTABLE';
export const INKWELL_PYTHON_ENV = 'INKWELL_PYTHON';

export interface BackendProcessConfigInput {
  isPackaged: boolean;
  dirname: string;
  resourcesPath: string;
  env: NodeJS.ProcessEnv;
  platform?: string;
  arch?: string;
  exists?: (path: string) => boolean;
}

export interface BackendProcessConfig {
  kind: 'executable' | 'python-module';
  command: string;
  args: string[];
  cwd: string;
  pythonExecutable: string;
  moduleName: 'inkwell.server';
}

export function resolveBackendResourcePath(resourcesPath: string): string {
  return join(resourcesPath, 'backend');
}

export function getBundledBackendExecutablePath(resourcesPath: string, platform: string, arch: string): string {
  const executable = platform === 'win32' ? 'inkwell-backend.exe' : 'inkwell-backend';
  return join(resourcesPath, 'backend-bin', `${platform}-${arch}`, executable);
}

function resolveDevelopmentBackendPath(dirname: string, exists: (path: string) => boolean): string {
  const candidates = [join(dirname, '../backend'), join(dirname, '../../backend')];
  return candidates.find((candidate) => exists(join(candidate, 'pyproject.toml'))) ?? candidates[0];
}

export function resolveBackendProcessConfig({
  isPackaged,
  dirname,
  resourcesPath,
  env,
  platform = process.platform,
  arch = process.arch,
  exists = existsSync,
}: BackendProcessConfigInput): BackendProcessConfig {
  const explicitExecutable = env[INKWELL_BACKEND_EXECUTABLE_ENV]?.trim();
  if (explicitExecutable && exists(explicitExecutable)) {
    return {
      kind: 'executable',
      command: explicitExecutable,
      args: [],
      cwd: pathDirname(explicitExecutable),
      pythonExecutable: env[INKWELL_PYTHON_ENV]?.trim() || '/usr/bin/python3',
      moduleName: 'inkwell.server',
    };
  }

  const bundledExecutable = getBundledBackendExecutablePath(resourcesPath, platform, arch);
  if (isPackaged && exists(bundledExecutable)) {
    return {
      kind: 'executable',
      command: bundledExecutable,
      args: [],
      cwd: join(resourcesPath, 'backend-bin', `${platform}-${arch}`),
      pythonExecutable: env[INKWELL_PYTHON_ENV]?.trim() || '/usr/bin/python3',
      moduleName: 'inkwell.server',
    };
  }

  const pythonExecutable = env[INKWELL_PYTHON_ENV]?.trim() || '/usr/bin/python3';
  return {
    kind: 'python-module',
    command: pythonExecutable,
    args: ['-m', 'inkwell.server'],
    cwd: isPackaged ? resolveBackendResourcePath(resourcesPath) : resolveDevelopmentBackendPath(dirname, exists),
    pythonExecutable,
    moduleName: 'inkwell.server',
  };
}
