import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

test('declares Qt/PDF4QT native shell build scripts', () => {
  assert.equal(packageJson.scripts['native:shell:configure'], 'node scripts/configure-native-shell.mjs');
  assert.equal(packageJson.scripts['native:shell:build'], 'cmake --build native/build/inkwell-shell --config Release');
  assert.equal(packageJson.scripts['native:shell:stage'], 'node scripts/stage-native-shell.mjs');
  assert.equal(
    packageJson.scripts['native:shell:package'],
    'npm run build:renderer && npm run native:shell:configure && npm run native:shell:build && npm run native:shell:stage',
  );
});

test('scaffolds Qt shell with PDF4QT editor as primary surface', () => {
  const cmake = readFileSync(resolve('native/inkwell-shell/CMakeLists.txt'), 'utf8');
  const bridgeHeader = readFileSync(resolve('native/inkwell-shell/src/inkwell_pdf_bridge.h'), 'utf8');
  const bridgeSource = readFileSync(resolve('native/inkwell-shell/src/inkwell_pdf_bridge.cpp'), 'utf8');
  const mainWindowHeader = readFileSync(resolve('native/inkwell-shell/src/inkwell_main_window.h'), 'utf8');
  const mainWindowSource = readFileSync(resolve('native/inkwell-shell/src/inkwell_main_window.cpp'), 'utf8');
  const main = readFileSync(resolve('native/inkwell-shell/src/main.cpp'), 'utf8');

  assert.equal(existsSync(resolve('native/inkwell-shell/cmake/AddPdf4QtGui.cmake')), true);
  assert.match(cmake, /add_executable\(inkwell-native-shell/);
  assert.match(cmake, /inkwell_add_pdf4qt_gui/);
  assert.match(cmake, /Pdf4QtLibGui/);
  assert.match(cmake, /Qt6::Widgets/);
  assert.match(cmake, /src\/inkwell_pdf_bridge\.cpp/);
  assert.match(cmake, /Qt6::WebChannel/);
  assert.match(bridgeHeader, /class InkwellPdfBridge : public QObject/);
  assert.match(bridgeHeader, /getCurrentDocumentJson/);
  assert.match(bridgeHeader, /previewOperationsJson/);
  assert.match(bridgeSource, /programController->getDocument\(\)/);
  assert.match(bridgeSource, /getCatalog\(\)->getPageCount\(\)/);
  assert.match(bridgeSource, /Q_EMIT currentDocumentChanged\(\)/);
  assert.doesNotMatch(bridgeSource, /\bemit currentDocumentChanged/);
  assert.match(bridgeSource, /PDFDocumentModifier modifier\(sourceDocument\)/);
  assert.match(bridgeSource, /createAnnotationHighlight/);
  assert.match(bridgeSource, /createAnnotationUnderline/);
  assert.match(bridgeSource, /createAnnotationStrikeout/);
  assert.match(bridgeSource, /isSupportedTextMarkupType/);
  assert.match(bridgeSource, /type == QStringLiteral\("underline"\)/);
  assert.match(bridgeSource, /type == QStringLiteral\("strikeout"\)/);
  assert.match(bridgeSource, /PDFTextLayoutGenerator/);
  assert.match(bridgeSource, /PDFTextFlow::createTextFlows/);
  assert.match(bridgeSource, /flow\.find\(query/);
  assert.match(bridgeSource, /operation\.value\(QStringLiteral\("query"\)\)/);
  assert.match(bridgeSource, /createAnnotationText/);
  assert.match(bridgeSource, /TextAnnotationIcon::Comment/);
  assert.match(bridgeSource, /createAnnotationFreeText/);
  assert.match(bridgeSource, /createAnnotationStamp/);
  assert.match(bridgeSource, /imageStamp/);
  assert.match(bridgeSource, /QImage/);
  assert.match(bridgeSource, /drawImage/);
  assert.match(bridgeSource, /setImageStampAppearance/);
  assert.match(bridgeSource, /createAnnotationSquare/);
  assert.match(bridgeSource, /createAnnotationCircle/);
  assert.match(bridgeSource, /createAnnotationLine/);
  assert.match(bridgeSource, /isSupportedAnnotationOperationType/);
  assert.match(bridgeSource, /setAnnotationOpacity/);
  assert.match(bridgeSource, /programController->onDocumentModified/);
  assert.match(bridgeSource, /operationCount/);
  assert.match(bridgeSource, /PDFUndoRedoManager/);
  assert.match(bridgeSource, /findChild<pdfviewer::PDFUndoRedoManager\*>/);
  assert.match(bridgeSource, /undoManager->doUndo\(\)/);
  assert.match(bridgeSource, /undoManager->doRedo\(\)/);
  assert.match(bridgeSource, /PDFDocumentWriter writer/);
  assert.match(bridgeSource, /_applied\.pdf/);
  assert.match(bridgeSource, /writer\.write\(outputPath, document, true\)/);
  assert.match(bridgeSource, /PreviewAnnotationRef/);
  assert.match(bridgeSource, /activePreviewBatches/);
  assert.match(bridgeSource, /previewBatch\.annotations\.push_back/);
  assert.match(bridgeSource, /removeAnnotation\(annotation\.page, annotation\.annotation\)/);
  assert.doesNotMatch(bridgeSource, /return unsupportedMutationJson\(QStringLiteral\("applyOperations"\)\)/);
  assert.doesNotMatch(bridgeSource, /return unsupportedMutationJson\(QStringLiteral\("undo"\)\)/);
  assert.doesNotMatch(bridgeSource, /return unsupportedMutationJson\(QStringLiteral\("redo"\)\)/);
  assert.doesNotMatch(bridgeSource, /return unsupportedMutationJson\(QStringLiteral\("clearPreview"\)\)/);
  assert.match(mainWindowHeader, /public pdfviewer::PDFEditorMainWindow/);
  assert.match(mainWindowHeader, /InkwellPdfBridge\* pdfBridge/);
  assert.match(mainWindowSource, /QDockWidget/);
  assert.match(mainWindowSource, /Agent Panel/);
  assert.match(mainWindowSource, /INKWELL_ENABLE_AGENT_WEBVIEW/);
  assert.match(mainWindowSource, /registerObject\(QStringLiteral\("pdfOperationBridge"\), pdfBridge\)/);
  assert.match(mainWindowSource, /Agent panel WebView is not compiled in/);
  assert.match(main, /mainWindow\.openInitialDocument/);
});

test('patches vendored PDF4QT for libc++ std execution policies', () => {
  const addPdf4Qt = readFileSync(resolve('native/inkwell-shell/cmake/AddPdf4QtGui.cmake'), 'utf8');

  assert.match(addPdf4Qt, /inkwell_patch_pdf4qt_std_execution/);
  assert.match(addPdf4Qt, /pdfexecutionpolicy\.h/);
  assert.match(addPdf4Qt, /pdfvisitor\.h/);
  assert.match(addPdf4Qt, /std::for_each\(first, last, f\);/);
  assert.match(addPdf4Qt, /std::sort\(first, last, f\);/);
  assert.match(addPdf4Qt, /std::for_each\(objects\.cbegin\(\), objects\.cend\(\), process\);/);
  assert.match(addPdf4Qt, /Applied PDF4QT libc\+\+ sequential algorithm compatibility patch/);
  assert.match(addPdf4Qt, /Applied PDF4QT libc\+\+ visitor traversal compatibility patch/);
});

test('generates PDF4QT root config header for vendored subdirectory build', () => {
  const addPdf4Qt = readFileSync(resolve('native/inkwell-shell/cmake/AddPdf4QtGui.cmake'), 'utf8');

  assert.match(addPdf4Qt, /configure_file\("\$\{PDF4QT_ROOT\}\/config\.h\.cmake" "\$\{CMAKE_BINARY_DIR\}\/config\.h" @ONLY\)/);
  assert.match(addPdf4Qt, /target_include_directories\(Pdf4QtLibCore PRIVATE "\$\{CMAKE_BINARY_DIR\}"\)/);
  assert.match(addPdf4Qt, /target_include_directories\(Pdf4QtLibGui PRIVATE "\$\{CMAKE_BINARY_DIR\}"\)/);
});

test('links PDF4QT Unix font lookup dependency', () => {
  const addPdf4Qt = readFileSync(resolve('native/inkwell-shell/cmake/AddPdf4QtGui.cmake'), 'utf8');

  assert.match(addPdf4Qt, /find_package\(Fontconfig REQUIRED\)/);
  assert.match(addPdf4Qt, /target_link_libraries\(Pdf4QtLibCore PRIVATE Fontconfig::Fontconfig\)/);
});

test('stages macOS native shell with in-app PDF4QT libraries', () => {
  const stageScript = readFileSync(resolve('scripts/stage-native-shell.mjs'), 'utf8');

  assert.match(stageScript, /rendererDistDir = resolve\('dist'\)/);
  assert.match(stageScript, /Contents', 'Resources', 'agent-panel'/);
  assert.match(stageScript, /npm run build:renderer/);
  assert.match(stageScript, /cpSync\(rendererDistDir, agentPanelDir/);
  assert.match(stageScript, /Contents', 'Frameworks'/);
  assert.match(stageScript, /libPdf4QtLib\.\*\\\.dylib/);
  assert.match(stageScript, /install_name_tool/);
  assert.match(stageScript, /@executable_path\/\.\.\/Frameworks/);
  assert.match(stageScript, /@loader_path/);
  assert.match(stageScript, /-delete_rpath', buildLibDir/);
});
