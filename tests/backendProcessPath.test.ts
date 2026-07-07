import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  INKWELL_PYTHON_ENV,
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
