import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';

// Disable GPU before the app is ready to avoid GPU process crashes on Linux
// with certain drivers/remote-desktop setups.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { AgentSession, type AgentEvent, type AgentKind, type AgentPromptOptions } from './agent.js';
import { NativePdfHostClient, type NativePdfCommandName } from './nativePdfBridge.js';

const isDev = process.env.NODE_ENV === 'development';

// The ACP provider library spawns each agent CLI as a raw child process and
// doesn't always attach an 'error' listener to it (e.g. on unexpected exit or
// a broken stdin pipe). An EventEmitter 'error' with no listener is fatal in
// Node by default, so any hiccup inside that library would otherwise take
// down this whole main process and blank the window. Log and keep running
// instead — the in-flight agent turn still fails, but the app survives it.
let lastAgentSender: Electron.WebContents | null = null;
function reportFatalToRenderer(label: string, err: unknown) {
  console.error(`[main] ${label} (recovered):`, err);
  if (lastAgentSender && !lastAgentSender.isDestroyed()) {
    lastAgentSender.send('agent:event', {
      type: 'error',
      message: `Internal error (${label}): ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
process.on('uncaughtException', (err) => reportFatalToRenderer('uncaughtException', err));
process.on('unhandledRejection', (reason) => reportFatalToRenderer('unhandledRejection', reason));

// Shared secret between this process and the Python backend. The renderer
// only ever learns it via IPC, never by reading the env directly, so a
// compromised web page loaded in the renderer can't read it out of band.
const backendToken = randomUUID();
const PDF4QT_HOST_ENV = 'INKWELL_PDF4QT_HOST';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
const agentSessions = new Map<AgentKind, AgentSession>();
let currentAgentKind: AgentKind = 'claude';
let currentPdfPath: string | null = null;
let backendPort = 18765;
const __dirname = dirname(fileURLToPath(import.meta.url));
let nativePdfHostClient: NativePdfHostClient | null = null;

type PdfSessionExportMode = 'none' | 'reference' | 'copy';

interface NativeAgentSessionExportRequest {
  suggestedName: string;
  handoffMarkdown: string;
  notesMarkdown: string;
  nextPrompt: string;
  activePdfPath?: string | null;
  hasUnsavedPreviewOperations: boolean;
}

function getNativePdfCoreStatus() {
  const hostPath = process.env[PDF4QT_HOST_ENV]?.trim();
  if (hostPath && existsSync(hostPath)) {
    return {
      mode: 'pdf4qt-ready',
      renderer: 'PDF4QT',
      writeEngine: 'PDF4QT command bridge',
      pdf4qt: { available: true, envVar: PDF4QT_HOST_ENV, hostPath },
      message: 'PDF4QT native core ready.',
    };
  }
  if (hostPath) {
    return {
      mode: 'pdf4qt-missing',
      renderer: 'pdf.js',
      writeEngine: 'PyMuPDF',
      pdf4qt: { available: false, envVar: PDF4QT_HOST_ENV, hostPath },
      message: `PDF4QT host configured but unavailable: ${hostPath}`,
    };
  }
  return {
    mode: 'pdfjs-fallback',
    renderer: 'pdf.js',
    writeEngine: 'PyMuPDF',
    pdf4qt: { available: false, envVar: PDF4QT_HOST_ENV },
    message: `PDF4QT host not configured. Set ${PDF4QT_HOST_ENV} to test the native core bridge.`,
  };
}

function getNativePdfHostClient(): NativePdfHostClient {
  const hostPath = process.env[PDF4QT_HOST_ENV]?.trim();
  if (!hostPath || !existsSync(hostPath)) {
    throw new Error(`PDF4QT host is not available. Set ${PDF4QT_HOST_ENV} to a valid host executable.`);
  }
  if (!nativePdfHostClient) nativePdfHostClient = new NativePdfHostClient(hostPath);
  return nativePdfHostClient;
}

function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(findAvailablePort(preferred + 1)));
    server.once('listening', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
    server.listen(preferred);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      // package.json has "type": "module", so vite-plugin-electron/simple
      // builds the preload as .mjs (see its `esmodule` check) — not .js.
      // Loading the wrong filename here means the preload silently never
      // runs, contextBridge never fires, and window.electronAPI stays
      // undefined, which crashes the renderer's first synchronous access
      // to it (e.g. ChatPanel's send button) into React's error boundary.
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // vite-plugin-electron sets the actual dev-server URL; fall back to the
    // default Vite port if for some reason it isn't available.
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startBackend() {
  // If a previous session left the backend listening on the preferred port,
  // pick a free one so we don't fail to launch.
  backendPort = await findAvailablePort(backendPort);

  // Must run as `-m inkwell.server`, not as a bare script path: server.py uses
  // a relative import (`from . import pdf_engine`) that only resolves when
  // Python knows it's running inside the `inkwell` package.
  backendProcess = spawn('/usr/bin/python3', ['-m', 'inkwell.server'], {
    cwd: join(__dirname, '../backend'),
    env: { ...process.env, INKWELL_PORT: String(backendPort), INKWELL_TOKEN: backendToken },
  });

  backendProcess.stdout?.on('data', (data) => {
    console.log(`[backend] ${data}`);
  });
  backendProcess.stderr?.on('data', (data) => {
    console.error(`[backend] ${data}`);
  });
  backendProcess.on('close', (code) => {
    console.log(`[backend] exited with code ${code}`);
    backendProcess = null;
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  nativePdfHostClient?.dispose();
  for (const session of agentSessions.values()) session.cleanup();
  if (process.platform !== 'darwin') app.quit();
});

function getOrCreateAgentSession(kind: AgentKind): AgentSession {
  let session = agentSessions.get(kind);
  if (!session) {
    // Use a freshly created, never-seen-before scratch directory as the ACP
    // session's cwd. Reusing the PDF's own folder (or a common path like the
    // system temp root) risks the underlying agent SDK auto-resuming an
    // unrelated prior conversation that happened to run with that same cwd.
    const workDir = mkdtempSync(join(app.getPath('temp'), `inkwell-agent-${kind}-`));
    session = new AgentSession(kind, `http://127.0.0.1:${backendPort}`, backendToken, workDir);
    agentSessions.set(kind, session);
  }
  session.setCurrentPdf(currentPdfPath);
  return session;
}

function collectWorkspaceFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isFile() && /\.(pdf|md|markdown)$/i.test(path)) {
        found.push(path);
      }
    }
  };
  visit(root);
  return Array.from(new Set(found)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function sanitizeExportName(name: string): string {
  const cleaned = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return cleaned || 'session';
}

function exportTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function choosePdfExportMode(
  request: NativeAgentSessionExportRequest,
): Promise<PdfSessionExportMode | null> {
  if (!request.activePdfPath) return 'none';

  const detail = request.hasUnsavedPreviewOperations
    ? 'Sparrow has preview annotations that are not written into the PDF yet. Copying exports the current source PDF; apply annotations first if you need them persisted.'
    : 'You can reference the current PDF in place or copy it into the export folder.';

  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'question',
    buttons: ['Reference Path', 'Copy PDF', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: 'How should Sparrow include the current PDF?',
    detail,
  });

  if (result.response === 2) return null;
  return result.response === 1 ? 'copy' : 'reference';
}

// IPC handlers
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'PDF files', extensions: ['pdf'] }],
  });
  const path = result.filePaths[0] ?? null;
  if (path) {
    currentPdfPath = path;
    for (const session of agentSessions.values()) session.setCurrentPdf(path);
  }
  return path;
});

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  const folder = result.filePaths[0];
  if (!folder) return [];
  return collectWorkspaceFiles(folder);
});

ipcMain.handle('app:getBackendUrl', () => `http://127.0.0.1:${backendPort}`);
ipcMain.handle('app:getBackendToken', () => backendToken);
ipcMain.handle('app:getNativePdfCoreStatus', () => getNativePdfCoreStatus());
ipcMain.handle(
  'nativePdf:command',
  async (_event, method: NativePdfCommandName, params: Record<string, unknown> = {}) =>
    getNativePdfHostClient().execute(method, params),
);

ipcMain.handle('app:setCurrentFile', (_event, path: string) => {
  currentPdfPath = path;
  for (const session of agentSessions.values()) session.setCurrentPdf(path);
});

ipcMain.handle('app:openPath', async (_event, path: string) => {
  if (!existsSync(path)) throw new Error(`Path does not exist: ${path}`);
  const error = await shell.openPath(path);
  if (error) throw new Error(error);
  return path;
});

ipcMain.handle(
  'session:exportNativeAgent',
  async (_event, request: NativeAgentSessionExportRequest) => {
    const pdfMode = await choosePdfExportMode(request);
    if (pdfMode === null) throw new Error('Session export cancelled.');

    const root = join(app.getPath('documents'), 'Sparrow Agent Exports');
    const directory = join(root, `${exportTimestamp()}-${sanitizeExportName(request.suggestedName)}`);
    mkdirSync(directory, { recursive: true });

    const handoffPath = join(directory, 'handoff.md');
    const notesPath = join(directory, 'notes.md');
    const promptPath = join(directory, 'next-prompt.txt');

    writeFileSync(handoffPath, request.handoffMarkdown, 'utf8');
    writeFileSync(notesPath, request.notesMarkdown.trim() || '# Session Notes\n\n_No notes written yet._\n', 'utf8');
    writeFileSync(promptPath, request.nextPrompt, 'utf8');

    let pdfPath: string | undefined;
    if (pdfMode === 'copy' && request.activePdfPath) {
      if (!existsSync(request.activePdfPath)) throw new Error(`PDF does not exist: ${request.activePdfPath}`);
      pdfPath = join(directory, basename(request.activePdfPath));
      copyFileSync(request.activePdfPath, pdfPath);
    } else if (pdfMode === 'reference' && request.activePdfPath) {
      pdfPath = request.activePdfPath;
    }

    shell.showItemInFolder(handoffPath);
    return { directory, handoffPath, notesPath, promptPath, pdfMode, pdfPath };
  },
);

ipcMain.handle('agent:getKind', () => currentAgentKind);
ipcMain.handle('agent:setKind', (_event, kind: AgentKind) => {
  currentAgentKind = kind;
});

ipcMain.on('agent:prompt', async (event, prompt: string, turnId: string, options?: AgentPromptOptions) => {
  lastAgentSender = event.sender;
  const send = (agentEvent: AgentEvent) => {
    if (!event.sender.isDestroyed()) event.sender.send('agent:event', { ...agentEvent, turnId });
  };
  try {
    const session = getOrCreateAgentSession(currentAgentKind);
    await session.sendMessage(prompt, send, options);
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});

ipcMain.on('agent:stop', (_event, _turnId: string) => {
  agentSessions.get(currentAgentKind)?.stopCurrentTurn();
});
