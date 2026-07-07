import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

test('defines cross-platform app packaging scripts', () => {
  assert.equal(packageJson.scripts['package:mac'], 'npm run build && electron-builder --mac');
  assert.equal(packageJson.scripts['package:win'], 'npm run build && electron-builder --win');
  assert.equal(packageJson.scripts['package:linux'], 'npm run build && electron-builder --linux');
  assert.equal(packageJson.scripts['package:all'], 'npm run build && electron-builder -mwl');
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

test('keeps packaging scope explicit while backend bundling is pending', () => {
  assert.ok(packageJson.build.files.includes('dist/**'));
  assert.ok(packageJson.build.files.includes('dist-electron/**'));
  assert.ok(packageJson.build.extraMetadata.description.includes('PDF'));
  assert.equal(packageJson.build.directories.output, 'release');
});
