import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  getBundledNativeShellPath,
  INKWELL_NATIVE_SHELL_ENV,
  resolveNativeShellPath,
} from '../electron/nativeShellPath';

test('resolves bundled native Qt shell path by platform and arch', () => {
  const resourcesPath = '/Applications/Inkwell.app/Contents/Resources';
  const expected = join(resourcesPath, 'native', 'inkwell-shell', 'darwin-arm64', 'inkwell-native-shell.app');
  assert.equal(getBundledNativeShellPath(resourcesPath, 'darwin', 'arm64'), expected);
});

test('uses exe suffix for Windows native Qt shell', () => {
  const resourcesPath = 'C:\\Program Files\\Inkwell\\resources';
  assert.match(getBundledNativeShellPath(resourcesPath, 'win32', 'x64'), /inkwell-native-shell\.exe$/);
});

test('environment native shell overrides bundled shell only when set', () => {
  const status = resolveNativeShellPath({
    envShellPath: '/opt/inkwell/inkwell-native-shell',
    resourcesPath: '/app/resources',
    platform: 'linux',
    arch: 'x64',
    exists: (path) => path === '/opt/inkwell/inkwell-native-shell',
  });

  assert.equal(status.source, 'environment');
  assert.equal(status.available, true);
  assert.equal(status.envVar, INKWELL_NATIVE_SHELL_ENV);
  assert.equal(status.shellPath, '/opt/inkwell/inkwell-native-shell');
});

test('reports missing native shell instead of falling back to web PDF rendering', () => {
  const status = resolveNativeShellPath({
    envShellPath: undefined,
    resourcesPath: '/app/resources',
    platform: 'linux',
    arch: 'x64',
    exists: () => false,
  });

  assert.equal(status.source, 'missing');
  assert.equal(status.available, false);
  assert.match(status.message, /native shell not configured/);
});
