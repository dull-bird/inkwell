import { useEffect, useRef, useState } from 'react';
import type { AgentKind } from '../../shared/agent-types';
import { AGENT_INFO } from '../../shared/agent-types';
import AgentLogo from './AgentLogo';

interface ToolActivity {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  done: boolean;
}

interface Message {
  role: 'user' | 'agent' | 'error';
  text: string;
  tools: ToolActivity[];
  streaming?: boolean;
}

interface ChatPanelProps {
  onFileOutput: (path: string) => void;
}

const AGENT_KINDS: AgentKind[] = ['claude', 'codex', 'kimi'];

function greeting(kind: AgentKind): Message {
  return {
    role: 'agent',
    text: `Hi, I'm ${AGENT_INFO[kind].label}. I can read, highlight, merge, split, watermark, or encrypt the PDF you have open — just ask.`,
    tools: [],
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[object]';
  }
}

export default function ChatPanel({ onFileOutput }: ChatPanelProps) {
  const [agentKind, setAgentKindState] = useState<AgentKind>('claude');
  const [messagesByAgent, setMessagesByAgent] = useState<Record<AgentKind, Message[]>>({
    claude: [greeting('claude')],
    codex: [greeting('codex')],
    kimi: [greeting('kimi')],
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const agentKindRef = useRef(agentKind);
  // Ref is fine for pointing at the *current* streaming message, but we guard
  // against stale indices whenever we read it.
  const streamingIndex = useRef<number | null>(null);

  useEffect(() => {
    window.electronAPI.getAgentKind().then(setAgentKindState);
  }, []);

  useEffect(() => {
    agentKindRef.current = agentKind;
  }, [agentKind]);

  const updateMessages = (kind: AgentKind, updater: (messages: Message[]) => Message[]) => {
    setMessagesByAgent((prev) => ({ ...prev, [kind]: updater(prev[kind]) }));
  };

  // Ensure the streaming index is still valid for the given message array.
  const ensureStreamingMsg = (next: Message[]): number => {
    if (streamingIndex.current !== null && next[streamingIndex.current]?.streaming) {
      return streamingIndex.current;
    }
    // Fallback: look for an existing streaming message.
    const existing = next.findIndex((m) => m.streaming);
    if (existing !== -1) {
      streamingIndex.current = existing;
      return existing;
    }
    // Start a new streaming message.
    streamingIndex.current = next.length;
    next.push({ role: 'agent', text: '', tools: [], streaming: true });
    return streamingIndex.current;
  };

  useEffect(() => {
    const unsubscribe = window.electronAPI.onAgentEvent((event) => {
      const kind = agentKindRef.current;
      if (event.type === 'text-delta') {
        updateMessages(kind, (prev) => {
          const next = [...prev];
          const idx = ensureStreamingMsg(next);
          const msg = next[idx];
          next[idx] = { ...msg, text: (msg.text ?? '') + (event.text ?? '') };
          return next;
        });
      } else if (event.type === 'tool-call') {
        updateMessages(kind, (prev) => {
          const next = [...prev];
          const idx = ensureStreamingMsg(next);
          const msg = next[idx];
          next[idx] = {
            ...msg,
            tools: [
              ...msg.tools,
              { toolCallId: event.toolCallId ?? 'unknown', toolName: event.toolName ?? 'unknown', args: event.args, done: false },
            ],
          };
          return next;
        });
      } else if (event.type === 'tool-result') {
        updateMessages(kind, (prev) => {
          const next = [...prev];
          if (streamingIndex.current === null) return prev;
          const idx = streamingIndex.current;
          const msg = next[idx];
          if (!msg || !msg.streaming) return prev;
          next[idx] = {
            ...msg,
            tools: msg.tools.map((t) =>
              t.toolCallId === event.toolCallId ? { ...t, result: event.result, done: true } : t,
            ),
          };
          return next;
        });
        if (event.toolName !== 'get_current_document' && event.toolName !== 'read_pdf_text' && event.toolName !== 'find_pdf_text') {
          const result = event.result as { output?: string } | undefined;
          if (result?.output) onFileOutput(result.output);
        }
      } else if (event.type === 'error') {
        updateMessages(kind, (prev) => [...prev, { role: 'error', text: event.message ?? 'Unknown agent error', tools: [] }]);
        streamingIndex.current = null;
        setBusy(false);
      } else if (event.type === 'done') {
        updateMessages(kind, (prev) => {
          if (streamingIndex.current === null) return prev;
          const next = [...prev];
          const idx = streamingIndex.current;
          if (next[idx]) {
            next[idx] = { ...next[idx], streaming: false };
          }
          return next;
        });
        streamingIndex.current = null;
        setBusy(false);
      }
    });
    return unsubscribe;
  }, [onFileOutput]);

  const switchAgent = async (kind: AgentKind) => {
    if (kind === agentKind || busy) return;
    streamingIndex.current = null; // reset so we don't index into a different agent's array
    setAgentKindState(kind);
    await window.electronAPI.setAgentKind(kind);
  };

  const sendMessage = () => {
    if (!input.trim() || busy) return;
    const userMsg = input.trim();
    streamingIndex.current = null;
    updateMessages(agentKind, (prev) => [...prev, { role: 'user', text: userMsg, tools: [] }]);
    setInput('');
    setBusy(true);
    window.electronAPI.sendAgentPrompt(userMsg);
  };

  const messages = messagesByAgent[agentKind];

  return (
    <div
      style={{
        width: 380,
        borderLeft: '1px solid #ddd',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: 12, borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, marginRight: 4 }}>Agent</span>
        {AGENT_KINDS.map((kind) => (
          <button
            key={kind}
            onClick={() => switchAgent(kind)}
            disabled={busy}
            title={AGENT_INFO[kind].label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px 3px 4px',
              borderRadius: 999,
              border: kind === agentKind ? `1.5px solid ${AGENT_INFO[kind].color}` : '1.5px solid transparent',
              background: kind === agentKind ? `${AGENT_INFO[kind].color}1a` : 'transparent',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            <AgentLogo kind={kind} size={16} />
            <span style={{ fontSize: 12, color: kind === agentKind ? '#111' : '#888' }}>{AGENT_INFO[kind].label}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: m.role === 'user' ? '#e6f4ff' : m.role === 'error' ? '#fdecea' : '#f5f5f5',
                color: m.role === 'error' ? '#b71c1c' : '#111',
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.text}
              {m.streaming && !m.text && <em style={{ color: '#999' }}>thinking…</em>}
            </div>
            {m.tools.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {m.tools.map((t) => (
                  <div
                    key={t.toolCallId}
                    style={{
                      fontSize: 12,
                      color: '#555',
                      background: '#eef',
                      borderRadius: 6,
                      padding: '4px 8px',
                    }}
                  >
                    {t.done ? '✓' : '⏳'} <strong>{t.toolName}</strong>
                    {t.args ? ` ${safeStringify(t.args)}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid #ddd', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={busy ? 'Waiting for agent…' : `Ask ${AGENT_INFO[agentKind].label}...`}
          disabled={busy}
          style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
        />
        <button onClick={sendMessage} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  );
}
