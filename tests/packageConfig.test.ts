import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const rootTsconfig = JSON.parse(readFileSync(resolve('tsconfig.json'), 'utf8'));
const electronTsconfig = JSON.parse(readFileSync(resolve('electron/tsconfig.json'), 'utf8'));
const viteConfig = readFileSync(resolve('vite.config.ts'), 'utf8');
const electronMain = readFileSync(resolve('electron/main.ts'), 'utf8');

test('defines cross-platform app packaging scripts', () => {
  assert.equal(packageJson.scripts.dev, 'node scripts/dev-server.mjs');
  assert.equal(packageJson.scripts.test, 'node scripts/run-tests.mjs');
  assert.equal(packageJson.scripts['package:mac'], 'npm run build && electron-builder --mac');
  assert.equal(packageJson.scripts['package:win'], 'npm run build && electron-builder --win');
  assert.equal(packageJson.scripts['package:linux'], 'npm run build && electron-builder --linux');
  assert.equal(packageJson.scripts['package:all'], 'npm run build && electron-builder -mwl');
  assert.equal(packageJson.scripts['package:mac:full'], 'npm run bundle:runtimes && npm run package:mac');
  assert.equal(packageJson.scripts['package:win:full'], 'npm run bundle:runtimes && npm run package:win');
  assert.equal(packageJson.scripts['package:linux:full'], 'npm run bundle:runtimes && npm run package:linux');
  assert.equal(packageJson.scripts['bundle:runtimes'], 'npm run native:package && npm run backend:bundle');
  assert.equal(packageJson.scripts['native:doctor'], 'node scripts/native-doctor.mjs');
  assert.equal(packageJson.scripts['native:configure'], 'node scripts/configure-native-host.mjs');
  assert.equal(packageJson.scripts['native:configure:pdf4qt'], 'node scripts/configure-native-host.mjs --pdf4qt');
  assert.equal(packageJson.scripts['backend:bundle'], 'node scripts/bundle-backend.mjs');
});

test('configures Electron Builder platform targets', () => {
  assert.equal(packageJson.devDependencies['electron-builder'], '^26.15.3');
  assert.equal(packageJson.build.appId, 'app.sparrowpdf.inkwell');
  assert.deepEqual(packageJson.build.mac.target, ['dmg', 'zip']);
  assert.deepEqual(packageJson.build.win.target, ['nsis']);
  assert.deepEqual(packageJson.build.linux.target, ['AppImage', 'deb']);
  assert.match(packageJson.build.artifactName, /\$\{os\}/);
  assert.match(packageJson.build.artifactName, /\$\{arch\}/);
});

test('keeps packaging scope explicit for app shell and runtime resources', () => {
  assert.ok(packageJson.build.files.includes('dist/**'));
  assert.ok(packageJson.build.files.includes('dist-electron/**'));
  assert.ok(packageJson.build.extraMetadata.description.includes('PDF'));
  assert.equal(packageJson.build.directories.output, 'release');
});

test('type-checks Electron bridge against the shared protocol without changing Vite output layout', () => {
  assert.equal(rootTsconfig.references, undefined);
  assert.equal(electronTsconfig.compilerOptions.noEmit, true);
  assert.equal(electronTsconfig.compilerOptions.rootDir, '..');
  assert.ok(electronTsconfig.include.includes('../shared/*.ts'));
});

test('keeps Vite dev Electron output isolated from production package output', () => {
  assert.match(viteConfig, /command === 'serve' \? '\.tmp\/dev-electron' : 'dist-electron'/);
  assert.match(viteConfig, /emptyOutDir: false/);
  assert.match(viteConfig, /overlay: false/);
  assert.ok(packageJson.build.files.includes('dist-electron/**'));
});

test('wraps the dev server so Vite esbuild service failures restart automatically', () => {
  const devServerScript = readFileSync(resolve('scripts/dev-server.mjs'), 'utf8');
  assert.match(devServerScript, /vite\/bin\/vite\.js/);
  assert.match(devServerScript, /The service is no longer running/);
  assert.match(devServerScript, /restartVite/);
  assert.match(devServerScript, /detached: process\.platform !== 'win32'/);
  assert.match(devServerScript, /child\.on\('exit'/);
  assert.match(devServerScript, /signalVite\('SIGTERM'\)/);
  assert.match(devServerScript, /signalChildGroup\('SIGTERM'\)/);
  assert.match(devServerScript, /signalChildGroup\('SIGKILL'\)/);
  assert.match(devServerScript, /process\.kill\(-child\.pid, signal\)/);
});

test('keeps Electron software compositing available in Linux remote sessions', () => {
  assert.match(electronMain, /disableHardwareAcceleration/);
  assert.match(electronMain, /disable-gpu/);
  assert.doesNotMatch(electronMain, /disable-software-rasterizer/);
});

test('packages runtime resources when present', () => {
  assert.deepEqual(packageJson.build.extraResources, [
    {
      from: 'native/dist',
      to: 'native/pdf4qt-host',
      filter: ['**/*'],
    },
    {
      from: 'backend',
      to: 'backend',
      filter: ['inkwell/**', 'pyproject.toml', '!**/__pycache__/**', '!**/*.pyc', '!**/*.egg-info/**', '!.venv/**'],
    },
    {
      from: 'backend/dist',
      to: 'backend-bin',
      filter: ['**/*'],
    },
  ]);
});
