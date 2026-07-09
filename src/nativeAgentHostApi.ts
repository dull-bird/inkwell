import type {
  AgentCatalog,
  AgentEvent,
  AgentKind,
  AgentPromptOptions,
  ElectronAPI,
} from '../shared/agent-types';

type NativeAgentEvent = AgentEvent & { turnId?: string };
type AgentListener = (event: NativeAgentEvent) => void;

interface QtSignal<T extends (...args: never[]) => void> {
  connect(listener: T): void;
}

interface NativeAgentHostBridge {
  getAgentKindJson(): string | Promise<string>;
  setAgentKindJson(kind: string): string | Promise<string>;
  getAgentCatalogJson(kind: string): string | Promise<string>;
  sendAgentPromptJson(prompt: string, turnId: string, optionsJson: string): void;
  stopAgentPromptJson(turnId: string): void;
  agentEventJson?: QtSignal<(eventJson: string) => void>;
}

interface QtWebChannelGlobal {
  agentHostBridge?: NativeAgentHostBridge;
  qt?: { webChannelTransport?: unknown };
  QWebChannel?: new (
    transport: unknown,
    callback: (channel: { objects?: Record<string, unknown> }) => void,
  ) => void;
  document?: Document;
}

interface NativeAgentHostApiOptions {
  getBridge?: () => NativeAgentHostBridge | null | Promise<NativeAgentHostBridge | null>;
}

const unavailableMessage = 'Native agent bridge is not available.';

export function createNativeSidePanelElectronApi(options: NativeAgentHostApiOptions = {}): ElectronAPI {
  let agentKind: AgentKind = 'claude';
  const listeners = new Set<AgentListener>();
  let signalConnected = false;

  const getBridge = options.getBridge ?? getNativeAgentHostBridge;

  const emit = (event: NativeAgentEvent) => {
    for (const listener of listeners) listener(event);
  };

  const withBridge = async (): Promise<NativeAgentHostBridge | null> => {
    const bridge = await getBridge();
    if (bridge && !signalConnected) {
      bridge.agentEventJson?.connect((eventJson) => {
        emit(parseAgentEvent(eventJson));
      });
      signalConnected = true;
    }
    return bridge;
  };

  return {
    openPdfFile: async () => null,
    openPdfFolder: async () => [],
    getBackendUrl: async () => {
      throw new Error('Native Qt side panel does not expose the Python backend URL.');
    },
    getBackendToken: async () => '',
    setCurrentFile: async () => {},
    openPath: async (path) => path,
    openNativeShell: async () => {
      throw new Error('Already running inside the native Qt shell.');
    },
    getNativePdfCoreStatus: async () => ({
      mode: 'pdf4qt-ready',
      renderer: 'PDF4QT',
      writeEngine: 'PyMuPDF',
      pdf4qt: { available: true, envVar: 'INKWELL_PDF4QT_HOST' },
      message: 'Qt/PDF4QT native shell is the active PDF surface.',
    }),
    runNativePdfCommand: async () => {
      throw new Error('Native Qt side panel uses PdfOperationBridge instead of stdio PDF host commands.');
    },
    exportNativeAgentSession: async () => {
      throw new Error('Native Qt side panel session export is not wired yet.');
    },
    getAgentKind: async () => {
      const bridge = await withBridge();
      if (!bridge) return agentKind;
      const response = parseJsonObject(await bridge.getAgentKindJson());
      if (isAgentKind(response.kind)) agentKind = response.kind;
      return agentKind;
    },
    setAgentKind: async (kind) => {
      agentKind = kind;
      const bridge = await withBridge();
      if (bridge) await bridge.setAgentKindJson(kind);
    },
    getAgentCatalog: async (kind) => {
      const bridge = await withBridge();
      if (!bridge) return unavailableCatalog(kind);
      return parseCatalog(await bridge.getAgentCatalogJson(kind));
    },
    sendAgentPrompt: (prompt, turnId, promptOptions) => {
      void withBridge().then((bridge) => {
        if (!bridge) {
          emit({ type: 'error', message: unavailableMessage, turnId });
          emit({ type: 'done', turnId });
          return;
        }
        bridge.sendAgentPromptJson(prompt, turnId, JSON.stringify(promptOptions ?? {} satisfies AgentPromptOptions));
      });
    },
    stopAgentPrompt: (turnId) => {
      void withBridge().then((bridge) => {
        if (bridge) bridge.stopAgentPromptJson(turnId);
        else emit({ type: 'aborted', turnId });
      });
    },
    onAgentEvent: (callback) => {
      listeners.add(callback);
      void withBridge();
      return () => listeners.delete(callback);
    },
  };
}

export async function getNativeAgentHostBridge(): Promise<NativeAgentHostBridge | null> {
  const globalObject = globalThis as QtWebChannelGlobal;
  if (isNativeAgentHostBridge(globalObject.agentHostBridge)) return globalObject.agentHostBridge;

  await loadQtWebChannelScript(globalObject);

  const transport = globalObject.qt?.webChannelTransport;
  const QWebChannelConstructor = globalObject.QWebChannel;
  if (!transport || !QWebChannelConstructor) return null;

  return new Promise((resolve) => {
    new QWebChannelConstructor(transport, (channel) => {
      const bridge = channel.objects?.agentHostBridge;
      if (isNativeAgentHostBridge(bridge)) {
        globalObject.agentHostBridge = bridge;
        resolve(bridge);
      } else {
        resolve(null);
      }
    });
  });
}

function unavailableCatalog(kind: AgentKind): AgentCatalog {
  return {
    models: [],
    modes: fallbackModes(),
    unavailableReason: `${kind}: ${unavailableMessage}`,
  };
}

function parseCatalog(rawResponse: string): AgentCatalog {
  const parsed = parseJsonObject(rawResponse);
  const models = Array.isArray(parsed.models)
    ? parsed.models.filter(isNamedOption)
    : [];
  const modes = Array.isArray(parsed.modes)
    ? parsed.modes.filter(isNamedOption)
    : fallbackModes();

  const catalog: AgentCatalog = {
    models,
    modes,
  };

  if (typeof parsed.currentModelId === 'string') catalog.currentModelId = parsed.currentModelId;
  if (typeof parsed.currentModeId === 'string') catalog.currentModeId = parsed.currentModeId;
  if (typeof parsed.unavailableReason === 'string') catalog.unavailableReason = parsed.unavailableReason;

  return catalog;
}

function parseAgentEvent(rawResponse: string): NativeAgentEvent {
  const parsed = parseJsonObject(rawResponse);
  if (typeof parsed.type !== 'string') return { type: 'error', message: 'Native agent bridge returned invalid event.' };

  switch (parsed.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return { type: parsed.type, text: typeof parsed.text === 'string' ? parsed.text : '', turnId: readTurnId(parsed) };
    case 'tool-call':
      return {
        type: 'tool-call',
        toolCallId: typeof parsed.toolCallId === 'string' ? parsed.toolCallId : '',
        toolName: typeof parsed.toolName === 'string' ? parsed.toolName : '',
        args: parsed.args,
        turnId: readTurnId(parsed),
      };
    case 'tool-result':
      return {
        type: 'tool-result',
        toolCallId: typeof parsed.toolCallId === 'string' ? parsed.toolCallId : '',
        toolName: typeof parsed.toolName === 'string' ? parsed.toolName : '',
        result: parsed.result,
        turnId: readTurnId(parsed),
      };
    case 'file-output':
      return { type: 'file-output', path: typeof parsed.path === 'string' ? parsed.path : '', turnId: readTurnId(parsed) };
    case 'aborted':
    case 'done':
      return { type: parsed.type, turnId: readTurnId(parsed) };
    case 'error':
      return {
        type: 'error',
        message: typeof parsed.message === 'string' ? parsed.message : 'Native agent bridge error.',
        turnId: readTurnId(parsed),
      };
    default:
      return { type: 'error', message: `Unknown native agent event ${parsed.type}.`, turnId: readTurnId(parsed) };
  }
}

function parseJsonObject(rawResponse: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawResponse) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function readTurnId(value: Record<string, unknown>): string | undefined {
  return typeof value.turnId === 'string' ? value.turnId : undefined;
}

function isNamedOption(value: unknown): value is { id: string; name: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

function fallbackModes(): Array<{ id: string; name: string }> {
  return [
    { id: 'ask', name: 'Ask' },
    { id: 'plan', name: 'Plan' },
    { id: 'edit', name: 'Edit' },
    { id: 'review', name: 'Review' },
  ];
}

function isAgentKind(value: unknown): value is AgentKind {
  return value === 'claude' || value === 'codex' || value === 'kimi';
}

function isNativeAgentHostBridge(value: unknown): value is NativeAgentHostBridge {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NativeAgentHostBridge).getAgentKindJson === 'function' &&
    typeof (value as NativeAgentHostBridge).getAgentCatalogJson === 'function' &&
    typeof (value as NativeAgentHostBridge).sendAgentPromptJson === 'function'
  );
}

function loadQtWebChannelScript(globalObject: QtWebChannelGlobal): Promise<void> {
  const document = globalObject.document;
  if (!document || globalObject.QWebChannel) return Promise.resolve();

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'qrc:///qtwebchannel/qwebchannel.js';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}
