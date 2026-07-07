import { join } from 'node:path';

export const INKWELL_PYTHON_ENV = 'INKWELL_PYTHON';

export interface BackendProcessConfigInput {
  isPackaged: boolean;
  dirname: string;
  resourcesPath: string;
  env: NodeJS.ProcessEnv;
}

export interface BackendProcessConfig {
  cwd: string;
  pythonExecutable: string;
  moduleName: 'inkwell.server';
}

export function resolveBackendResourcePath(resourcesPath: string): string {
  return join(resourcesPath, 'backend');
}

export function resolveBackendProcessConfig({
  isPackaged,
  dirname,
  resourcesPath,
  env,
}: BackendProcessConfigInput): BackendProcessConfig {
  return {
    cwd: isPackaged ? resolveBackendResourcePath(resourcesPath) : join(dirname, '../backend'),
    pythonExecutable: env[INKWELL_PYTHON_ENV]?.trim() || '/usr/bin/python3',
    moduleName: 'inkwell.server',
  };
}
