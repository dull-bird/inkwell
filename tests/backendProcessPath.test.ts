import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  INKWELL_BACKEND_EXECUTABLE_ENV,
  INKWELL_PYTHON_ENV,
  getBundledBackendExecutablePath,
  resolveBackendProcessConfig,
  resolveBackendResourcePath,
} from '../electron/backendProcessPath';

test('resolves development backend path next to repository backend directory', () => {
  const config = resolveBackendProcessConfig({
    isPackaged: false,
    dirname: '/work/inkwell/dist-electron',
    resourcesPath: '/Applications/Sparrow.app/Contents/Resources',
    env: {},
  });

  assert.equal(config.cwd, join('/work/inkwell/dist-electron', '../backend'));
  assert.equal(config.kind, 'python-module');
  assert.equal(config.command, '/usr/bin/python3');
  assert.deepEqual(config.args, ['-m', 'inkwell.server']);
  assert.equal(config.pythonExecutable, '/usr/bin/python3');
  assert.equal(config.moduleName, 'inkwell.server');
});

test('resolves packaged backend path from Electron resources', () => {
  const resourcesPath = '/Applications/Sparrow.app/Contents/Resources';
  assert.equal(resolveBackendResourcePath(resourcesPath), join(resourcesPath, 'backend'));

  const config = resolveBackendProcessConfig({
    isPackaged: true,
    dirname: '/ignored/app.asar/dist-electron',
    resourcesPath,
    env: {},
  });

  assert.equal(config.cwd, join(resourcesPath, 'backend'));
  assert.equal(config.kind, 'python-module');
});

test('allows explicit Python executable override for packaged deployments', () => {
  const config = resolveBackendProcessConfig({
    isPackaged: true,
    dirname: '/ignored/app.asar/dist-electron',
    resourcesPath: '/resources',
    env: { [INKWELL_PYTHON_ENV]: '/opt/sparrow/python/bin/python3' },
  });

  assert.equal(config.pythonExecutable, '/opt/sparrow/python/bin/python3');
});

test('resolves bundled backend executable before Python module fallback', () => {
  const resourcesPath = '/Applications/Sparrow.app/Contents/Resources';
  const executablePath = join(resourcesPath, 'backend-bin', 'darwin-arm64', 'inkwell-backend');
  assert.equal(getBundledBackendExecutablePath(resourcesPath, 'darwin', 'arm64'), executablePath);

  const config = resolveBackendProcessConfig({
    isPackaged: true,
    dirname: '/ignored/app.asar/dist-electron',
    resourcesPath,
    platform: 'darwin',
    arch: 'arm64',
    env: {},
    exists: (path) => path === executablePath,
  });

  assert.equal(config.kind, 'executable');
  assert.equal(config.command, executablePath);
  assert.deepEqual(config.args, []);
  assert.equal(config.cwd, join(resourcesPath, 'backend-bin', 'darwin-arm64'));
});

test('allows explicit backend executable override for release diagnostics', () => {
  const config = resolveBackendProcessConfig({
    isPackaged: true,
    dirname: '/ignored/app.asar/dist-electron',
    resourcesPath: '/resources',
    env: { [INKWELL_BACKEND_EXECUTABLE_ENV]: '/tmp/inkwell-backend' },
    exists: (path) => path === '/tmp/inkwell-backend',
  });

  assert.equal(config.kind, 'executable');
  assert.equal(config.command, '/tmp/inkwell-backend');
});
