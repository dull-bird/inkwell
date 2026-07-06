import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createACPProvider, acpTools } from '@mcpc-tech/acp-ai-provider';
import { streamText, tool } from 'ai';
import { z } from 'zod';

// Mirrored (not imported) in shared/agent-types.ts so the renderer's
// TypeScript program never needs to resolve this file's runtime-heavy
// dependencies (@mcpc-tech/acp-ai-provider, ai, zod) just to know the shape
// of these events.
export type AgentEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'file-output'; path: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type AgentKind = 'claude' | 'codex' | 'kimi';

// Every ACP-compatible CLI reports the real tool name/args nested inside its
// own generic dynamic-tool wrapper. Only calls to our own MCP-style tool
// names (prefixed by acpTools()) are worth surfacing to the chat UI — this
// filters out each agent's internal bookkeeping calls (e.g. Claude's
// "ToolSearch" lookups).
const OUR_TOOL_MARKER = 'acp-ai-sdk-tools__';

// Tools that could read/write/execute arbitrary things on the user's
// machine. Inkwell only wants the agent to operate the PDF through our own
// backend tools below, not act as a general coding agent against the whole
// machine. WebFetch/WebSearch are left enabled — they can't touch the local
// filesystem or run code, so the worst case is an unexpected network call.
const CLAUDE_DISALLOWED_NATIVE_TOOLS = ['Bash', 'Write', 'Edit', 'NotebookEdit', 'Task'];

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveAgentEntry(pkg: string): string {
  return join(__dirname, `../node_modules/${pkg}/dist/index.js`);
}

interface AgentRuntimeConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  sessionMeta?: Record<string, unknown>;
  /** Skips the provider's "which auth method?" guesswork when we know which one applies. */
  authMethodId?: string;
  /** Known gaps in how well this agent's native tools are locked down. */
  caveat?: string;
}

// `process.execPath` inside Electron's main process is the Electron binary
// itself. Without ELECTRON_RUN_AS_NODE, spawning it launches a second full
// Electron GUI (GPU process, renderer, the works) instead of running the
// agent as a plain Node script.
const RUN_AS_NODE = { ELECTRON_RUN_AS_NODE: '1' };

function buildRuntimeConfig(kind: AgentKind): AgentRuntimeConfig {
  switch (kind) {
    case 'claude':
      return {
        command: process.execPath,
        args: [resolveAgentEntry('@agentclientprotocol/claude-agent-acp')],
        env: RUN_AS_NODE,
        sessionMeta: { claudeCode: { options: { disallowedTools: CLAUDE_DISALLOWED_NATIVE_TOOLS } } },
      };
    case 'codex':
      return {
        command: process.execPath,
        args: [resolveAgentEntry('@agentclientprotocol/codex-acp')],
        // Codex's own sandbox: no file writes or shell commands without
        // explicit escalation, independent of our MCP tools below.
        env: { ...RUN_AS_NODE, INITIAL_AGENT_MODE: 'read-only' },
        // Reuses the same ChatGPT login `codex login` already set up, instead
        // of the provider guessing and defaulting to the API-key method.
        authMethodId: 'chat-gpt',
      };
    case 'kimi':
      return {
        command: 'kimi',
        args: ['acp'],
        caveat:
          'Kimi Code CLI has no verified equivalent of a disallowed-tools list yet, so its own ' +
          'native tools are not hard-blocked the way Claude/Codex are here — treat it as less sandboxed ' +
          'until that is confirmed.',
      };
  }
}

interface BackendCallOptions {
  method?: string;
  body?: unknown;
}

// acpTools() is supposed to auto-wrap a plain returned value into MCP's
// `{content: [{type: 'text', text}]}` shape, but in practice objects (as
// opposed to strings) sometimes come through as empty results. Wrapping
// explicitly ourselves sidesteps that and matches the MCP CallToolResult
// format the README recommends for non-trivial return values.
function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data) }],
  };
}

// Reverses textResult(): pulls the text back out of the MCP content-block
// array the AI SDK reports as a tool-result's `output`, and JSON.parses it
// back into a plain value when possible.
function unwrapToolOutput(output: unknown): unknown {
  const block = Array.isArray(output) ? (output[0] as { type?: string; text?: string } | undefined) : undefined;
  if (!block || block.type !== 'text' || typeof block.text !== 'string') return output;
  try {
    return JSON.parse(block.text);
  } catch {
    return block.text;
  }
}

export class AgentSession {
  private provider: ReturnType<typeof createACPProvider>;
  private currentPdfPath: string | null = null;

  constructor(
    readonly kind: AgentKind,
    private backendUrl: string,
    private backendToken: string,
    workDir: string,
  ) {
    const runtime = buildRuntimeConfig(kind);
    if (runtime.caveat) console.warn(`[agent:${kind}] ${runtime.caveat}`);
    this.provider = createACPProvider({
      command: runtime.command,
      args: runtime.args,
      env: runtime.env,
      authMethodId: runtime.authMethodId,
      session: {
        cwd: workDir,
        mcpServers: [],
        ...(runtime.sessionMeta ? { _meta: runtime.sessionMeta } : {}),
      },
      persistSession: true,
    });
  }

  setCurrentPdf(path: string | null): void {
    this.currentPdfPath = path;
  }

  cleanup(): void {
    this.provider.cleanup();
  }

  private async backendCall(path: string, options: BackendCallOptions = {}): Promise<unknown> {
    const res = await fetch(`${this.backendUrl}${path}`, {
      method: options.method ?? 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inkwell-Token': this.backendToken },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((json as { detail?: string } | null)?.detail ?? `Backend error ${res.status}`);
    }
    return json;
  }

  private resolvePath(path: string | undefined): string {
    const resolved = path || this.currentPdfPath;
    if (!resolved) {
      throw new Error('No PDF is currently open in Inkwell. Ask the user to open one first.');
    }
    return resolved;
  }

  private buildTools(onEvent: (event: AgentEvent) => void) {
    const notifyOutput = (path: string) => onEvent({ type: 'file-output', path });

    return acpTools({
      get_current_document: tool({
        description: "Get the absolute file path of the PDF currently open in the user's Inkwell viewer.",
        inputSchema: z.object({}),
        execute: async () => textResult(this.currentPdfPath ?? 'No PDF is currently open.'),
      }),
      read_pdf_text: tool({
        description: 'Extract the text content of a PDF (optionally a single 0-indexed page).',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          page: z.number().int().optional().describe('0-indexed page number. Omit to extract the whole document.'),
        }),
        execute: async ({ path, page }) =>
          textResult(await this.backendCall('/extract-text', { body: { path: this.resolvePath(path), page } })),
      }),
      find_pdf_text: tool({
        description:
          'Search a PDF for every occurrence of a text query and return the highlight operations ' +
          '(page + bounding boxes) that would highlight them. This does NOT modify the file — call ' +
          'apply_pdf_highlights with the returned operations to actually write them to disk.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          query: z.string().describe('Text to search for.'),
          color: z.array(z.number()).length(3).optional().describe('RGB 0-1 highlight color.'),
        }),
        execute: async ({ path, query, color }) =>
          textResult(await this.backendCall('/highlight', { body: { path: this.resolvePath(path), query, color } })),
      }),
      apply_pdf_highlights: tool({
        description:
          'Write highlight operations (as returned by find_pdf_text) to a new copy of the PDF, saved as ' +
          '"<name>_applied.pdf" next to the original. The original file is never modified.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          operations: z
            .array(
              z.object({
                page: z.number().int(),
                rects: z.array(z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })),
                color: z.array(z.number()).length(3),
              }),
            )
            .describe('Operations returned by find_pdf_text.'),
        }),
        execute: async ({ path, operations }) => {
          const result = (await this.backendCall('/apply', {
            body: { path: this.resolvePath(path), operations },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      merge_pdfs: tool({
        description: 'Merge multiple PDFs (in order) into a single new PDF file.',
        inputSchema: z.object({ paths: z.array(z.string()).min(2).describe('Absolute paths, in merge order.') }),
        execute: async ({ paths }) => {
          const result = (await this.backendCall('/merge', { body: { paths } })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      split_pdf: tool({
        description: 'Split a PDF into one file per page, written to a directory.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          output_dir: z.string().optional().describe('Directory to write pages to. Defaults to a temp directory.'),
        }),
        execute: async ({ path, output_dir }) =>
          textResult(await this.backendCall('/split', { body: { path: this.resolvePath(path), output_dir } })),
      }),
      watermark_pdf: tool({
        description: 'Stamp a diagonal text watermark on every page, saved as "<name>_watermarked.pdf".',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          text: z.string().describe('Watermark text.'),
        }),
        execute: async ({ path, text }) => {
          const result = (await this.backendCall('/watermark', {
            body: { path: this.resolvePath(path), text },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      encrypt_pdf: tool({
        description: 'Password-protect a PDF with AES-256 encryption, saved as "<name>_encrypted.pdf".',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          user_pw: z.string().describe('Password required to open the file.'),
          owner_pw: z.string().optional().describe('Owner password. Defaults to the user password.'),
        }),
        execute: async ({ path, user_pw, owner_pw }) => {
          const result = (await this.backendCall('/encrypt', {
            body: { path: this.resolvePath(path), user_pw, owner_pw },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      rotate_pdf_pages: tool({
        description: 'Set the absolute rotation of specific pages, saved as "<name>_rotated.pdf".',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          rotations: z
            .record(z.string(), z.number().int())
            .describe('Map of 0-indexed page number (as a string key) to absolute rotation in degrees: 0, 90, 180, or 270.'),
        }),
        execute: async ({ path, rotations }) => {
          const result = (await this.backendCall('/rotate', {
            body: { path: this.resolvePath(path), rotations },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      reorder_pdf_pages: tool({
        description:
          'Rewrite the PDF with pages in a new order, saved as "<name>_reordered.pdf". Pages omitted from ' +
          'new_order are deleted, so this also covers "delete these pages" requests.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          new_order: z
            .array(z.number().int())
            .describe('0-indexed page numbers in the desired final order, e.g. [2, 0, 1] or [0, 2] to drop page 1.'),
        }),
        execute: async ({ path, new_order }) => {
          const result = (await this.backendCall('/reorder', {
            body: { path: this.resolvePath(path), new_order },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      read_pdf_form_fields: tool({
        description: 'List every fillable form field in a PDF (name, type, current value, page, position).',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
        }),
        execute: async ({ path }) =>
          textResult(await this.backendCall('/form-fields', { body: { path: this.resolvePath(path) } })),
      }),
      fill_pdf_form: tool({
        description:
          'Set form field values by name (as returned by read_pdf_form_fields), saved as "<name>_filled.pdf".',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe(
            'Map of form field name to the value it should be set to.',
          ),
        }),
        execute: async ({ path, values }) => {
          const result = (await this.backendCall('/fill-form', {
            body: { path: this.resolvePath(path), values },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
    });
  }

  async sendMessage(prompt: string, onEvent: (event: AgentEvent) => void): Promise<void> {
    try {
      const { fullStream } = streamText({
        model: this.provider.languageModel(),
        prompt,
        tools: this.buildTools(onEvent),
      });

      for await (const part of fullStream) {
        if (part.type === 'text-delta') {
          onEvent({ type: 'text-delta', text: part.text });
        } else if (part.type === 'tool-call' || part.type === 'tool-result') {
          const inner = (part as { input?: { toolName?: string; args?: unknown } }).input;
          const realName = inner?.toolName;
          // Different ACP agents prefix our MCP tool names slightly
          // differently (e.g. Claude's "mcp__acp-ai-sdk-tools__x"); matching
          // on the marker substring rather than an exact prefix keeps this
          // working regardless of exactly how each agent namespaces it.
          const markerIndex = realName?.indexOf(OUR_TOOL_MARKER) ?? -1;
          if (markerIndex === -1) continue;
          const shortName = realName!.slice(markerIndex + OUR_TOOL_MARKER.length);
          if (part.type === 'tool-call') {
            onEvent({ type: 'tool-call', toolCallId: part.toolCallId, toolName: shortName, args: inner?.args });
          } else {
            const output = (part as unknown as { output?: unknown }).output;
            onEvent({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              toolName: shortName,
              result: unwrapToolOutput(output),
            });
          }
        } else if (part.type === 'error') {
          onEvent({ type: 'error', message: String((part as { error: unknown }).error) });
        }
      }
      onEvent({ type: 'done' });
    } catch (err) {
      onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }
}
