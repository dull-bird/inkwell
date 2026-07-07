import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  PDF4QT_HOST_ENV,
  getBundledNativePdfHostPath,
  resolveNativePdfHostPath,
} from '../electron/nativePdfHostPath';

test('resolves bundled native host path by platform and arch', () => {
  const resourcesPath = '/Applications/Sparrow.app/Contents/Resources';
  const expected = join(resourcesPath, 'native', 'pdf4qt-host', 'darwin-arm64', 'inkwell-pdf4qt-host');
  const result = resolveNativePdfHostPath({
    envHostPath: undefined,
    resourcesPath,
    platform: 'darwin',
    arch: 'arm64',
    exists: (path) => path === expected,
  });

  assert.equal(result.source, 'bundled');
  assert.equal(result.available, true);
  assert.equal(result.hostPath, expected);
  assert.deepEqual(result.checkedPaths, [expected]);
});

test('uses exe suffix for Windows bundled native host', () => {
  assert.equal(
    getBundledNativePdfHostPath('C:\\Sparrow\\resources', 'win32', 'x64'),
    join('C:\\Sparrow\\resources', 'native', 'pdf4qt-host', 'win32-x64', 'inkwell-pdf4qt-host.exe'),
  );
});

test('environment host overrides bundled native host only when set', () => {
  const result = resolveNativePdfHostPath({
    envHostPath: '/tmp/debug-host',
    resourcesPath: '/resources',
    platform: 'linux',
    arch: 'x64',
    exists: (path) => path === '/tmp/debug-host',
  });

  assert.equal(result.source, 'environment');
  assert.equal(result.available, true);
  assert.equal(result.hostPath, '/tmp/debug-host');
  assert.deepEqual(result.checkedPaths, ['/tmp/debug-host']);
  assert.equal(result.envVar, PDF4QT_HOST_ENV);
});

test('reports missing explicit environment host instead of silently falling back', () => {
  const result = resolveNativePdfHostPath({
    envHostPath: '/missing/debug-host',
    resourcesPath: '/resources',
    platform: 'linux',
    arch: 'x64',
    exists: () => false,
  });

  assert.equal(result.source, 'environment');
  assert.equal(result.available, false);
  assert.equal(result.hostPath, '/missing/debug-host');
  assert.match(result.message, /configured but unavailable/);
});
