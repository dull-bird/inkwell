import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

test('declares native host build scripts without coupling them to normal app build', () => {
  assert.equal(packageJson.scripts['native:configure'], 'cmake -S native/pdf4qt-host -B native/build/pdf4qt-host');
  assert.equal(packageJson.scripts['native:build'], 'cmake --build native/build/pdf4qt-host --config Release');
  assert.equal(packageJson.scripts['native:stage'], 'node scripts/stage-native-host.mjs');
  assert.equal(
    packageJson.scripts['native:package'],
    'npm run native:configure && npm run native:build && npm run native:stage',
  );
  assert.equal(packageJson.scripts.build, 'tsc && vite build && npm run build:electron');
});

test('scaffolds a Qt stdio JSON native PDF4QT host project', () => {
  const cmakePath = resolve('native/pdf4qt-host/CMakeLists.txt');
  const mainPath = resolve('native/pdf4qt-host/src/main.cpp');
  const readmePath = resolve('native/pdf4qt-host/README.md');

  assert.equal(existsSync(cmakePath), true);
  assert.equal(existsSync(mainPath), true);
  assert.equal(existsSync(readmePath), true);

  const cmake = readFileSync(cmakePath, 'utf8');
  assert.match(cmake, /project\(inkwell_pdf4qt_host/);
  assert.match(cmake, /find_package\(Qt6 REQUIRED COMPONENTS Core\)/);
  assert.match(cmake, /add_executable\(inkwell-pdf4qt-host/);

  const main = readFileSync(mainPath, 'utf8');
  assert.match(main, /QJsonDocument/);
  assert.match(main, /--stdio-json/);
  assert.match(main, /jsonrpc/);
  assert.match(main, /host_status/);
  assert.match(main, /pdf4qt_adapter/);
  assert.match(main, /PDF4QT adapter not linked/);
});

test('stages native host into resolver-compatible platform arch directory', () => {
  const script = readFileSync(resolve('scripts/stage-native-host.mjs'), 'utf8');
  assert.match(script, /native\/dist/);
  assert.match(script, /process\.platform/);
  assert.match(script, /process\.arch/);
  assert.match(script, /inkwell-pdf4qt-host/);
});
