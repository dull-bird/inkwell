import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ChevronRight, Send, Shield, Sparkles, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentEvent, AgentKind, AgentReasoningLevel } from '../../shared/agent-types';
import { AGENT_INFO } from '../../shared/agent-types';
import {
  buildAgentPromptOptions,
  type AgentModeSelection,
  type AgentModelSelection,
} from '../agentControls';
import { shouldShowJumpToLatest, shouldStickToBottom } from '../chatScroll';
import type { DocumentAnalysis, SuggestedAction } from '../documentAnalysis';
import { derivePdfToolAction } from '../pdfToolResults';
import type { AiPermissionMode } from '../privacy';
import { buildResearchPrompt } from '../researchContext';
import { buildWorkspaceSummaryPrompt, type WorkspaceDocumentContext } from '../workspaceContext';
import AgentLogo from './AgentLogo';
import type { HighlightOperation } from './PdfViewer';
import SparrowMark from './SparrowMark';
import './ChatPanel.css';

type Part =
  | { kind: 'reasoning'; text: string }
  | { kind: 'tool'; toolCallId: string; toolName: string; args: unknown; result?: unknown; done: boolean }
  | { kind: 'text'; text: string };

interface Message {
  id: string;
  role: 'user' | 'agent' | 'error';
  text: string;
  parts: Part[];
  streaming?: boolean;
  stopped?: boolean;
}

interface PendingAgentPrompt {
  id: string;
  text: string;
}

interface ChatPanelProps {
  activeDocumentTitle: string | null;
  activeDocumentContext: WorkspaceDocumentContext | null;
  analysis: DocumentAnalysis | null;
  analysisStatus: 'idle' | 'analyzing' | 'ready' | 'error';
  workspaceDocuments: WorkspaceDocumentContext[];
  aiEnabled: boolean;
  privacyMode: AiPermissionMode;
  externalPrompt: PendingAgentPrompt | null;
  onExternalPromptConsumed: (id: string) => void;
  onEnableAi: () => void;
  onAnalyzeDocument: () => void;
  onFileOutput: (path: string) => void;
  onRunSuggestion: (suggestion: SuggestedAction) => void;
  onSplitOutput: (outputDir: string, fileCount: number) => void;
  onPreviewHighlights: (operations: HighlightOperation[]) => void;
}

type AgentStreamEvent = AgentEvent & { turnId?: string };

const AGENT_KINDS: AgentKind[] = ['claude', 'codex', 'kimi'];
const MODE_OPTIONS: Array<{ value: AgentModeSelection; label: string }> = [
  { value: 'default', label: 'Agent default' },
  { value: 'ask', label: 'Ask' },
  { value: 'plan', label: 'Plan' },
  { value: 'edit', label: 'Edit' },
  { value: 'review', label: 'Review' },
];
const REASONING_OPTIONS: Array<{ value: AgentReasoningLevel; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function newId(): string {
  return crypto.randomUUID();
}

function greeting(kind: AgentKind): Message {
  return {
    id: newId(),
    role: 'agent',
    text: '',
    parts: [
      {
        kind: 'text',
        text: `${AGENT_INFO[kind].label} connected. AI stays idle until you enable permission and send a request.`,
      },
    ],
  };
}

const initialMessages: Record<AgentKind, Message[]> = {
  claude: [greeting('claude')],
  codex: [greeting('codex')],
  kimi: [greeting('kimi')],
};

export default function ChatPanel({
  activeDocumentTitle,
  activeDocumentContext,
  analysis,
  analysisStatus,
  workspaceDocuments,
  aiEnabled,
  privacyMode,
  externalPrompt,
  onExternalPromptConsumed,
  onEnableAi,
  onAnalyzeDocument,
  onFileOutput,
  onRunSuggestion,
  onSplitOutput,
  onPreviewHighlights,
}: ChatPanelProps) {
  const [agentKind, setAgentKindState] = useState<AgentKind>('claude');
  const [messagesByAgent, setMessagesByAgent] = useState<Record<AgentKind, Message[]>>(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [openParts, setOpenParts] = useState<Record<string, boolean>>({});
  const [modelSelection, setModelSelection] = useState<AgentModelSelection>('default');
  const [customModelId, setCustomModelId] = useState('');
  const [modeSelection, setModeSelection] = useState<AgentModeSelection>('default');
  const [reasoningLevel, setReasoningLevel] = useState<AgentReasoningLevel>('auto');
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const agentKindRef = useRef(agentKind);
  const activeTurnIdRef = useRef<string | null>(null);
  const turnAgentByIdRef = useRef<Record<string, AgentKind>>({});
  const stoppedTurnIdsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const canChat = aiEnabled && Boolean(activeDocumentTitle);
  const messages = messagesByAgent[agentKind];

  useEffect(() => {
    void window.electronAPI.getAgentKind().then(setAgentKindState);
  }, []);

  useEffect(() => {
    agentKindRef.current = agentKind;
    stickToBottomRef.current = true;
  }, [agentKind]);

  const updateMessages = useCallback((kind: AgentKind, updater: (messages: Message[]) => Message[]) => {
    setMessagesByAgent((prev) => ({ ...prev, [kind]: updater(prev[kind]) }));
  }, []);

  const patchTurn = useCallback(
    (kind: AgentKind, turnId: string | undefined, patch: (msg: Message) => Message) => {
      if (!turnId) return;
      updateMessages(kind, (prev) => {
        const idx = prev.findIndex((message) => message.id === turnId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = patch(next[idx]);
        return next;
      });
    },
    [updateMessages],
  );

  const finishTurn = useCallback((turnId: string | undefined) => {
    if (!turnId || activeTurnIdRef.current === turnId) {
      activeTurnIdRef.current = null;
      setActiveTurnId(null);
      setBusy(false);
    }
    if (turnId) {
      delete turnAgentByIdRef.current[turnId];
      stoppedTurnIdsRef.current.delete(turnId);
    }
  }, []);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const appendDelta = (msg: Message, kind: 'reasoning' | 'text', text: string): Message => {
    const parts = [...msg.parts];
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) {
      parts[parts.length - 1] = { ...last, text: last.text + text };
    } else {
      parts.push({ kind, text });
    }
    return { ...msg, parts };
  };

  useEffect(() => {
    const unsubscribe = window.electronAPI.onAgentEvent((event: AgentStreamEvent) => {
      const turnId = event.turnId;
      const kind: AgentKind = turnId
        ? turnAgentByIdRef.current[turnId] ?? agentKindRef.current
        : agentKindRef.current;
      const wasStopped = Boolean(turnId && stoppedTurnIdsRef.current.has(turnId));
      const isTerminal = event.type === 'done' || event.type === 'error' || event.type === 'aborted';

      if (wasStopped && !isTerminal) return;

      if (event.type === 'reasoning-delta') {
        patchTurn(kind, turnId, (msg) => appendDelta(msg, 'reasoning', event.text));
        return;
      }

      if (event.type === 'text-delta') {
        patchTurn(kind, turnId, (msg) => appendDelta(msg, 'text', event.text));
        return;
      }

      if (event.type === 'tool-call') {
        patchTurn(kind, turnId, (msg) => ({
          ...msg,
          parts: [
            ...msg.parts,
            {
              kind: 'tool',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              done: false,
            },
          ],
        }));
        return;
      }

      if (event.type === 'tool-result') {
        patchTurn(kind, turnId, (msg) => ({
          ...msg,
          parts: msg.parts.map((part) =>
            part.kind === 'tool' && part.toolCallId === event.toolCallId
              ? { ...part, result: event.result, done: true }
              : part,
          ),
        }));

        const action = derivePdfToolAction(event.toolName, event.result);
        if (action?.kind === 'preview-highlights') onPreviewHighlights(action.operations);
        if (action?.kind === 'split-output') onSplitOutput(action.outputDir, action.fileCount);
        if (action?.kind === 'file-output') onFileOutput(action.path);
        return;
      }

      if (event.type === 'file-output') {
        onFileOutput(event.path);
        return;
      }

      if (event.type === 'aborted') {
        patchTurn(kind, turnId, (msg) => ({ ...msg, streaming: false, stopped: true }));
        finishTurn(turnId);
        return;
      }

      if (event.type === 'error') {
        patchTurn(kind, turnId, (msg) => ({ ...msg, streaming: false }));
        updateMessages(kind, (prev) => [
          ...prev,
          { id: newId(), role: 'error', text: event.message || 'Unknown agent error', parts: [] },
        ]);
        finishTurn(turnId);
        return;
      }

      if (event.type === 'done') {
        patchTurn(kind, turnId, (msg) => ({ ...msg, streaming: false }));
        finishTurn(turnId);
      }
    });
    return unsubscribe;
  }, [finishTurn, onFileOutput, onPreviewHighlights, onSplitOutput, patchTurn, updateMessages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      scrollToLatest();
      return;
    }
    setShowJumpToLatest(shouldShowJumpToLatest(el));
  }, [messages, scrollToLatest]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const stick = shouldStickToBottom(el);
    stickToBottomRef.current = stick;
    setShowJumpToLatest(shouldShowJumpToLatest(el));
  };

  const switchAgent = async (kind: AgentKind) => {
    if (kind === agentKind || busy || !aiEnabled) return;
    stickToBottomRef.current = true;
    setAgentKindState(kind);
    await window.electronAPI.setAgentKind(kind);
  };

  const sendPrompt = useCallback(
    (prompt: string) => {
      if (!prompt.trim() || busy) return;
      if (!canChat) {
        updateMessages(agentKind, (prev) => [
          ...prev,
          {
            id: newId(),
            role: 'error',
            text: 'AI is disabled for this PDF. Enable AI before sending document content to an agent.',
            parts: [],
          },
        ]);
        return;
      }

      const userMsg = prompt.trim();
      const replyId = newId();
      const options = buildAgentPromptOptions(modelSelection, customModelId, modeSelection, reasoningLevel);

      stickToBottomRef.current = true;
      turnAgentByIdRef.current[replyId] = agentKind;
      activeTurnIdRef.current = replyId;
      setActiveTurnId(replyId);
      updateMessages(agentKind, (prev) => [
        ...prev,
        { id: newId(), role: 'user', text: userMsg, parts: [] },
        { id: replyId, role: 'agent', text: '', parts: [], streaming: true },
      ]);
      setInput('');
      setBusy(true);
      window.electronAPI.sendAgentPrompt(userMsg, replyId, options);
    },
    [
      agentKind,
      busy,
      canChat,
      customModelId,
      modeSelection,
      modelSelection,
      reasoningLevel,
      updateMessages,
    ],
  );

  const stopCurrentTurn = useCallback(() => {
    const turnId = activeTurnIdRef.current;
    if (!turnId) return;
    const kind = turnAgentByIdRef.current[turnId] ?? agentKindRef.current;
    stoppedTurnIdsRef.current.add(turnId);
    window.electronAPI.stopAgentPrompt(turnId);
    patchTurn(kind, turnId, (msg) => ({ ...msg, streaming: false, stopped: true }));
    activeTurnIdRef.current = null;
    setActiveTurnId(null);
    setBusy(false);
  }, [patchTurn]);

  useEffect(() => {
    if (!externalPrompt || !canChat || busy) return;
    sendPrompt(externalPrompt.text);
    onExternalPromptConsumed(externalPrompt.id);
  }, [busy, canChat, externalPrompt, onExternalPromptConsumed, sendPrompt]);

  const runSuggestion = (suggestion: SuggestedAction) => {
    if (suggestion.id === 'highlight-headings') {
      onRunSuggestion(suggestion);
      return;
    }
    if (suggestion.intent === 'research' && activeDocumentContext) {
      sendPrompt(buildResearchPrompt(activeDocumentContext, suggestion.prompt));
      return;
    }
    sendPrompt(suggestion.prompt);
  };

  const summarizeWorkspace = () => {
    try {
      sendPrompt(buildWorkspaceSummaryPrompt(workspaceDocuments));
    } catch (error) {
      updateMessages(agentKind, (prev) => [
        ...prev,
        { id: newId(), role: 'error', text: error instanceof Error ? error.message : String(error), parts: [] },
      ]);
    }
  };

  const composerPlaceholder = canChat
    ? busy
      ? 'Agent is responding. Stop it before sending another request.'
      : 'Ask about the current PDF...'
    : 'Enable AI for this PDF to chat';

  return (
    <aside className="sparrow-agent-panel">
      <header className="agent-header">
        <div className="assistant-id">
          <SparrowMark size={30} />
          <div>
            <div className="assistant-name">小雀</div>
            <div className="assistant-subtitle">{activeDocumentTitle ?? 'No PDF selected'}</div>
          </div>
        </div>
        <label className="agent-select">
          <AgentLogo kind={agentKind} size={16} />
          <select value={agentKind} disabled={busy || !aiEnabled} onChange={(event) => switchAgent(event.target.value as AgentKind)}>
            {AGENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {AGENT_INFO[kind].label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="agent-controls" aria-label="Agent controls">
        <label>
          <span>Model</span>
          <select
            value={modelSelection}
            disabled={busy || !aiEnabled}
            onChange={(event) => setModelSelection(event.target.value as AgentModelSelection)}
          >
            <option value="default">Agent default</option>
            <option value="custom">Custom model</option>
          </select>
        </label>
        <label>
          <span>Mode</span>
          <select
            value={modeSelection}
            disabled={busy || !aiEnabled}
            onChange={(event) => setModeSelection(event.target.value as AgentModeSelection)}
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Think</span>
          <select
            value={reasoningLevel}
            disabled={busy || !aiEnabled}
            onChange={(event) => setReasoningLevel(event.target.value as AgentReasoningLevel)}
          >
            {REASONING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {modelSelection === 'custom' && (
          <input
            className="custom-model-input"
            value={customModelId}
            onChange={(event) => setCustomModelId(event.target.value)}
            placeholder="model id"
            disabled={busy || !aiEnabled}
          />
        )}
      </section>

      <section className={`assistant-card privacy-card ${aiEnabled ? 'enabled' : ''}`}>
        <div className="card-title">AI Permission</div>
        <div className="privacy-card-row">
          <Shield size={16} />
          <span>{aiEnabled ? `Enabled · ${privacyMode}` : `Off · ${privacyMode}`}</span>
        </div>
        {!aiEnabled && (
          <button className="workspace-action" onClick={onEnableAi} disabled={!activeDocumentTitle}>
            Enable AI for this PDF
          </button>
        )}
      </section>

      <section className="assistant-card">
        <div className="card-title">Document Sense</div>
        {analysis ? (
          <>
            <div className="analysis-kind">{analysis.label}</div>
            <div className="analysis-summary">{analysis.summary}</div>
            <div className="suggestion-grid">
              {analysis.suggestions.slice(0, 6).map((suggestion) => (
                <button key={suggestion.id} onClick={() => runSuggestion(suggestion)} disabled={busy}>
                  {suggestion.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="analysis-summary">
              {analysisStatus === 'analyzing'
                ? '正在本地抽取文本并分析文档类型。'
                : '未分析。点击 Analyze 后才会读取 PDF 文本。'}
            </div>
            <button className="workspace-action" onClick={onAnalyzeDocument} disabled={!activeDocumentTitle || busy}>
              <Sparkles size={14} />
              Analyze
            </button>
          </>
        )}
      </section>

      {workspaceDocuments.length > 1 && (
        <section className="assistant-card workspace-card">
          <div className="card-title">Workspace</div>
          <div className="analysis-kind">{workspaceDocuments.length} PDFs</div>
          <div className="analysis-summary">小雀可以在你开启 AI 后读取当前工作集，做联动总结、比较和后续建议。</div>
          <button className="workspace-action" onClick={summarizeWorkspace} disabled={busy || !aiEnabled}>
            Summarize workspace
          </button>
        </section>
      )}

      <div className="chat-stream-wrap">
        <div ref={scrollRef} onScroll={handleScroll} className="chat-scroll">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              openParts={openParts}
              onTogglePart={(partKey) => setOpenParts((prev) => ({ ...prev, [partKey]: !prev[partKey] }))}
            />
          ))}
        </div>
        {showJumpToLatest && (
          <button className="jump-latest" onClick={scrollToLatest}>
            <ArrowDown size={14} />
            Latest
          </button>
        )}
      </div>

      <footer className="chat-composer">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              sendPrompt(input);
            }
          }}
          placeholder={composerPlaceholder}
          disabled={!canChat || busy}
          rows={3}
        />
        <div className="composer-actions">
          {busy ? (
            <button className="stop-button" onClick={stopCurrentTurn} disabled={!activeTurnId}>
              <Square size={14} />
              Stop
            </button>
          ) : (
            <button onClick={() => sendPrompt(input)} disabled={!canChat || !input.trim()}>
              <Send size={15} />
              Send
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}

function ChatMessage({
  message,
  openParts,
  onTogglePart,
}: {
  message: Message;
  openParts: Record<string, boolean>;
  onTogglePart: (partKey: string) => void;
}) {
  if (message.role === 'user') return <div className="chat-message user">{message.text}</div>;
  if (message.role === 'error') return <div className="chat-message error">{message.text}</div>;

  const hasParts = message.parts.length > 0;

  return (
    <div className="chat-message agent">
      {!hasParts && message.streaming && (
        <div className="chat-thinking">
          <span className="chat-spinner" />
          <span className="chat-thinking-label">Thinking</span>
        </div>
      )}

      {message.parts.map((part, index) => {
        const partKey = `${message.id}-${index}`;
        const isLast = index === message.parts.length - 1;
        if (part.kind === 'reasoning') {
          const isLive = Boolean(message.streaming && isLast);
          const open = Boolean(openParts[partKey]);
          return (
            <div className="chat-reasoning" key={partKey}>
              <button className="chat-reasoning-header" onClick={() => onTogglePart(partKey)}>
                {isLive && <span className="chat-spinner" />}
                <span className={isLive ? 'chat-thinking-label' : ''}>{isLive ? 'Thinking' : 'Reasoning'}</span>
                <ChevronRight className={`chat-tool-caret ${open ? 'open' : ''}`} size={14} />
              </button>
              {open && <pre>{part.text}</pre>}
            </div>
          );
        }

        if (part.kind === 'tool') {
          return (
            <ToolPart
              key={partKey}
              partKey={partKey}
              tool={part}
              open={Boolean(openParts[partKey])}
              onToggle={onTogglePart}
            />
          );
        }

        return (
          <div className="md-content" key={partKey}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
          </div>
        );
      })}

      {message.stopped && <div className="chat-stopped">Stopped</div>}
    </div>
  );
}

function ToolPart({
  partKey,
  tool,
  open,
  onToggle,
}: {
  partKey: string;
  tool: Extract<Part, { kind: 'tool' }>;
  open: boolean;
  onToggle: (partKey: string) => void;
}) {
  return (
    <div className="chat-tool-card">
      <button className="chat-tool-header" onClick={() => onToggle(partKey)}>
        {!tool.done && <span className="chat-spinner" />}
        <span>{tool.done ? 'Called' : 'Calling'}</span>
        <span className="chat-tool-name">{tool.toolName}</span>
        <ChevronRight className={`chat-tool-caret ${open ? 'open' : ''}`} size={14} />
      </button>

      {open && (
        <div className="chat-tool-body">
          {tool.args !== undefined && (
            <>
              <div>Input</div>
              <pre>{safeStringify(tool.args)}</pre>
            </>
          )}
          {tool.result !== undefined && (
            <>
              <div className="tool-result-title">Result</div>
              <pre>{safeStringify(tool.result)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
