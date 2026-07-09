import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Qt shell loads React in native side-panel surface mode', () => {
  const cmake = readFileSync(resolve('native/inkwell-shell/CMakeLists.txt'), 'utf8');
  const mainWindowSource = readFileSync(resolve('native/inkwell-shell/src/inkwell_main_window.cpp'), 'utf8');
  const agentBridgeHeader = readFileSync(resolve('native/inkwell-shell/src/inkwell_agent_bridge.h'), 'utf8');

  assert.match(mainWindowSource, /surface=native-panel/);
  assert.match(mainWindowSource, /INKWELL_AGENT_PANEL_URL/);
  assert.match(mainWindowSource, /agent-panel\/index\.html/);
  assert.match(mainWindowSource, /QUrl::fromLocalFile/);
  assert.match(mainWindowSource, /resolveAgentPanelUrl/);
  assert.match(mainWindowSource, /registerObject\(QStringLiteral\("agentHostBridge"\), agentBridge\)/);
  assert.match(mainWindowSource, /view->setUrl\(resolveAgentPanelUrl\(\)\)/);
  assert.match(cmake, /src\/inkwell_agent_bridge\.cpp/);
  assert.match(agentBridgeHeader, /Q_INVOKABLE QString getAgentCatalogJson/);
  assert.match(agentBridgeHeader, /Q_SIGNAL void agentEventJson/);
});

test('React installs native host API for Qt WebView side panel', () => {
  const mainSource = readFileSync(resolve('src/main.tsx'), 'utf8');

  assert.match(mainSource, /isNativeSidePanelSurface/);
  assert.match(mainSource, /createNativeSidePanelElectronApi/);
  assert.match(mainSource, /createBrowserPreviewElectronApi/);
  assert.ok(
    mainSource.indexOf('createNativeSidePanelElectronApi') < mainSource.indexOf('createBrowserPreviewElectronApi'),
    'native side-panel host API should be chosen before browser preview fallback',
  );
});

test('App renders native side panel without React PDF surface', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');

  assert.match(appSource, /isNativeSidePanelSurface/);
  assert.match(appSource, /getCurrentDocumentWithNativeBridge/);
  assert.match(appSource, /native-agent-panel-shell/);
  assert.match(appSource, /NativeSidePanelControls/);
  assert.ok(
    appSource.indexOf('if (nativeSidePanel)') > -1 &&
      appSource.indexOf('if (nativeSidePanel)') < appSource.indexOf('<PdfViewer'),
    'native side-panel branch should return before the React PDF handoff surface',
  );
});
