import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

test('declares native host build scripts without coupling them to normal app build', () => {
  assert.equal(packageJson.scripts['native:doctor'], 'node scripts/native-doctor.mjs');
  assert.equal(packageJson.scripts['native:configure'], 'node scripts/configure-native-host.mjs');
  assert.equal(packageJson.scripts['native:configure:pdf4qt'], 'node scripts/configure-native-host.mjs --pdf4qt');
  assert.equal(packageJson.scripts['native:build'], 'cmake --build native/build/pdf4qt-host --config Release');
  assert.equal(packageJson.scripts['native:stage'], 'node scripts/stage-native-host.mjs');
  assert.equal(
    packageJson.scripts['native:package'],
    'npm run native:configure && npm run native:build && npm run native:stage',
  );
  assert.equal(packageJson.scripts.build, 'npm run build:renderer && npm run build:electron');
  assert.equal(packageJson.scripts['build:renderer'], 'tsc && vite build');
});

test('scaffolds a Qt stdio JSON native PDF4QT host project', () => {
  const cmakePath = resolve('native/pdf4qt-host/CMakeLists.txt');
  const mainPath = resolve('native/pdf4qt-host/src/main.cpp');
  const adapterPath = resolve('native/pdf4qt-host/src/pdf4qt_adapter.cpp');
  const adapterCmakePath = resolve('native/pdf4qt-host/cmake/AddPdf4QtCore.cmake');
  const readmePath = resolve('native/pdf4qt-host/README.md');

  assert.equal(existsSync(cmakePath), true);
  assert.equal(existsSync(mainPath), true);
  assert.equal(existsSync(adapterPath), true);
  assert.equal(existsSync(adapterCmakePath), true);
  assert.equal(existsSync(readmePath), true);

  const cmake = readFileSync(cmakePath, 'utf8');
  assert.match(cmake, /project\(inkwell_pdf4qt_host/);
  assert.match(cmake, /INKWELL_USE_BUNDLED_PDF4QT/);
  assert.match(cmake, /native\/vendor\/pdf4qt/);
  assert.match(cmake, /find_package\(Qt6 REQUIRED COMPONENTS Core\)/);
  assert.match(cmake, /add_executable\(inkwell-pdf4qt-host/);
  assert.match(cmake, /Pdf4QtLibCore/);

  const main = readFileSync(mainPath, 'utf8');
  assert.match(main, /QJsonDocument/);
  assert.match(main, /--stdio-json/);
  assert.match(main, /jsonrpc/);

  const adapter = readFileSync(adapterPath, 'utf8');
  assert.match(main, /host_status/);
  assert.match(adapter, /pdf4qt_adapter/);
  assert.match(adapter, /PDF4QT adapter not linked/);
  assert.match(adapter, /INKWELL_ENABLE_PDF4QT_ADAPTER/);
  assert.match(adapter, /PDFDocumentReader/);
  assert.match(adapter, /findTextInDocument/);
  assert.match(adapter, /PDFTextLayoutGenerator/);
  assert.match(adapter, /PDFTextFlow::createTextFlows/);
  assert.match(adapter, /method == "find_text"/);
  assert.match(adapter, /method == "preview_highlights"/);
  assert.match(adapter, /method == "export_text"/);

  const adapterCmake = readFileSync(adapterCmakePath, 'utf8');
  assert.match(adapterCmake, /PDF4QT_BUILD_ONLY_CORE_LIBRARY/);
  assert.match(adapterCmake, /add_subdirectory/);
  assert.match(adapterCmake, /configure_file\("\$\{PDF4QT_ROOT\}\/config\.h\.cmake"/);
  assert.match(adapterCmake, /INKWELL_OPENJPEG_INCLUDE_DIR/);
});

test('stages native host into resolver-compatible platform arch directory', () => {
  const script = readFileSync(resolve('scripts/stage-native-host.mjs'), 'utf8');
  assert.match(script, /native\/dist/);
  assert.match(script, /process\.platform/);
  assert.match(script, /process\.arch/);
  assert.match(script, /inkwell-pdf4qt-host/);
});

test('vendors PDF4QT as an explicit submodule dependency', () => {
  const gitmodules = readFileSync(resolve('.gitmodules'), 'utf8');
  assert.match(gitmodules, /\[submodule "native\/vendor\/pdf4qt"\]/);
  assert.match(gitmodules, /https:\/\/github\.com\/JakubMelka\/PDF4QT\.git/);
  assert.equal(existsSync(resolve('native/vendor/pdf4qt/Pdf4QtLibCore/CMakeLists.txt')), true);
});

test('documents local native dependency checks', () => {
  const script = readFileSync(resolve('scripts/native-doctor.mjs'), 'utf8');
  assert.match(script, /PDF4QT submodule/);
  assert.match(script, /Qt6Core/);
  assert.match(script, /Qt6Gui/);
  assert.match(script, /blend2d|libopenjp2|lcms2/);
});

test('auto-configures the native host with local Qt and PDF4QT when available', () => {
  const script = readFileSync(resolve('scripts/configure-native-host.mjs'), 'utf8');
  assert.match(script, /findQtPrefixes/);
  assert.match(script, /CMAKE_PREFIX_PATH/);
  assert.match(script, /INKWELL_USE_BUNDLED_PDF4QT=ON/);
  assert.match(script, /INKWELL_QT_PREFIX/);
  assert.match(script, /INKWELL_NATIVE_PREFIX/);
  assert.match(script, /gcc-10/);
  assert.match(script, /--stub/);
});

test('native PDF4QT host renders pages as PNG files for the renderer surface', () => {
  const adapter = readFileSync(resolve('native/pdf4qt-host/src/pdf4qt_adapter.cpp'), 'utf8');
  const header = readFileSync(resolve('native/pdf4qt-host/src/pdf4qt_adapter.h'), 'utf8');
  const readme = readFileSync(resolve('native/pdf4qt-host/README.md'), 'utf8');

  assert.match(adapter, /method == "export_pages_as_images"/);
  assert.match(adapter, /exportPagesAsImages/);
  assert.match(adapter, /QImage/);
  assert.match(adapter, /render/);
  assert.match(header, /exportPagesAsImages/);
  assert.match(readme, /export_pages_as_images/);
});
