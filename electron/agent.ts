import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { app } from 'electron';
import { createACPProvider, acpTools } from '@mcpc-tech/acp-ai-provider';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { normalizeAgentPageRanges, splitPdfPageRangesSchema } from './agentSplitRanges.js';
import { extractInkwellToolEvent } from './agentToolEvents.js';

// Mirrored (not imported) in shared/agent-types.ts so the renderer's
// TypeScript program never needs to resolve this file's runtime-heavy
// dependencies (@mcpc-tech/acp-ai-provider, ai, zod) just to know the shape
// of these events.
export type AgentEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'file-output'; path: string }
  | { type: 'aborted' }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type AgentKind = 'claude' | 'codex' | 'kimi';
export type AgentReasoningLevel = 'auto' | 'low' | 'medium' | 'high';

export interface AgentPromptOptions {
  modelId?: string;
  modeId?: string;
  reasoningLevel?: AgentReasoningLevel;
}

// Every ACP-compatible CLI reports the real tool name/args nested inside its
// own generic dynamic-tool wrapper. Only calls to our own MCP-style tool
// names (prefixed by acpTools()) are worth surfacing to the chat UI — this
// filters out each agent's internal bookkeeping calls (e.g. Claude's
// "ToolSearch" lookups).

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

function reasoningInstruction(level: AgentReasoningLevel | undefined): string {
  switch (level) {
    case 'low':
      return '[Inkwell: Reasoning intensity requested: low. Prefer fast, direct answers.]';
    case 'medium':
      return '[Inkwell: Reasoning intensity requested: medium. Balance speed with careful checking.]';
    case 'high':
      return '[Inkwell: Reasoning intensity requested: high. Use deep reasoning for document understanding and edits.]';
    default:
      return '';
  }
}

export class AgentSession {
  private provider: ReturnType<typeof createACPProvider>;
  private currentPdfPath: string | null = null;
  private activeAbortController: AbortController | null = null;

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
    this.stopCurrentTurn();
    this.provider.cleanup();
  }

  stopCurrentTurn(): void {
    this.activeAbortController?.abort();
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
      highlight_pdf_headings: tool({
        description:
          'Detect heading-like text blocks and return highlight operations. This does NOT modify the file — ' +
          'the Inkwell viewer can preview these operations immediately, and apply_pdf_highlights writes a new PDF copy.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          color: z.array(z.number()).length(3).optional().describe('RGB 0-1 highlight color. Defaults to yellow.'),
          opacity: z.number().min(0).max(1).optional().describe('Highlight opacity. Defaults to 0.25.'),
        }),
        execute: async ({ path, color, opacity }) =>
          textResult(
            await this.backendCall('/highlight-headings', {
              body: { path: this.resolvePath(path), color, opacity },
            }),
          ),
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
                opacity: z.number().min(0).max(1).optional(),
                text: z.string().optional(),
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
        description:
          'Split PDF into files. Omit page_ranges to split into one file per page. ' +
          'Use object page_ranges, e.g. [{start: 2, end: 5}] creates one PDF pages 2-5.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults currently open document.'),
          output_dir: z.string().optional().describe('Directory write pages to. Defaults temp directory.'),
          page_ranges: splitPdfPageRangesSchema
            .optional()
            .describe('1-based inclusive page ranges requested by user, e.g. [{start: 1, end: 3}].'),
        }),
        execute: async ({ path, output_dir, page_ranges }) =>
          textResult(
            await this.backendCall('/split', {
              body: { path: this.resolvePath(path), output_dir, page_ranges: normalizeAgentPageRanges(page_ranges) },
            }),
          ),
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
      add_pdf_comment: tool({
        description:
          'Add a standard PDF sticky-note comment annotation and save a new "<name>_commented.pdf" copy. ' +
          'Use page/x/y coordinates in PDF points, with page 0-indexed.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults currently open document.'),
          page: z.number().int().describe('0-indexed page number.'),
          x: z.number().describe('X coordinate in PDF points from left edge.'),
          y: z.number().describe('Y coordinate in PDF points from top edge.'),
          text: z.string().describe('Comment text.'),
          author: z.string().optional().describe('Comment author. Defaults Inkwell.'),
        }),
        execute: async ({ path, page, x, y, text, author }) => {
          const result = (await this.backendCall('/comment', {
            body: { path: this.resolvePath(path), page, x, y, text, author },
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
      export_markdown_note: tool({
        description:
          'Save Markdown text as a .md file in the "Inkwell Notes" folder inside the user\'s Documents ' +
          'directory. Use this whenever the user asks to export, save, or download a note or summary as Markdown.',
        inputSchema: z.object({
          filename: z.string().describe('File name without a path or extension, e.g. "meeting-summary".'),
          content: z.string().describe('The full Markdown content to write.'),
        }),
        execute: async ({ filename, content }) => {
          const notesDir = join(app.getPath('documents'), 'Inkwell Notes');
          await mkdir(notesDir, { recursive: true });
          // Strip any path separators so this can only ever land inside notesDir.
          const safeName = filename.replace(/[/\\]/g, '_').replace(/\.md$/i, '') || 'note';
          const outPath = join(notesDir, `${safeName}.md`);
          await writeFile(outPath, content, 'utf-8');
          return textResult({ output: outPath });
        },
      }),
    });
  }

  async sendMessage(
    prompt: string,
    onEvent: (event: AgentEvent) => void,
    options: AgentPromptOptions = {},
  ): Promise<void> {
    this.stopCurrentTurn();
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    try {
      // ACP agents (Claude Code's CLI in particular) run as one persistent
      // session per AgentSession instance — `system` is only honored while
      // that session is first established, so it goes stale the moment the
      // user opens/switches a PDF mid-conversation. The prompt text, unlike
      // `system`, really is resent fresh on every turn, so the current PDF
      // path is folded into it here instead of relying on `system` alone.
      const pdfContext = this.currentPdfPath
        ? `[Inkwell: the PDF currently open in the viewer is "${this.currentPdfPath}". Use it directly for ` +
          'anything the user refers to as "this PDF"/"the document"/"it" — do not ask for a path. ' +
          'For highlighting or annotations, return preview operations first so Inkwell displays them immediately. ' +
          'Only call apply_pdf_highlights when the user explicitly asks to save/apply/export/write a PDF copy.]'
        : '[Inkwell: no PDF is currently open in the viewer.]';
      const { fullStream } = streamText({
        model: this.provider.languageModel(options.modelId, options.modeId),
        system: this.currentPdfPath
          ? `The user currently has a PDF open in Inkwell at: ${this.currentPdfPath}. When they refer to ` +
            '"this PDF", "the document", "it", etc. without giving a path, operate on that file directly — ' +
            'do not ask them for a path or a URL first. For visual edits such as highlighting or annotations, ' +
            'return preview operations first so Inkwell can show them immediately. Do not call apply_pdf_highlights ' +
            'unless the user explicitly asks to save, apply, write, export, or create a new PDF copy.'
          : 'No PDF is currently open in Inkwell. If the user refers to "the PDF" without specifying one, ' +
            'tell them to open a file first.',
        prompt: [pdfContext, reasoningInstruction(options.reasoningLevel), prompt].filter(Boolean).join('\n\n'),
        tools: this.buildTools(onEvent),
        abortSignal: abortController.signal,
      });

      for await (const part of fullStream) {
        if (abortController.signal.aborted) break;
        if (part.type === 'text-delta') {
          onEvent({ type: 'text-delta', text: part.text });
        } else if (part.type === 'reasoning-delta') {
          onEvent({ type: 'reasoning-delta', text: part.text });
      } else if (part.type === 'tool-call' || part.type === 'tool-result') {
        const toolEvent = extractInkwellToolEvent(part);
        if (!toolEvent) continue;
        if (part.type === 'tool-call') {
          onEvent({
            type: 'tool-call',
            toolCallId: toolEvent.toolCallId,
            toolName: toolEvent.toolName,
            args: toolEvent.args,
          });
        } else {
          onEvent({
            type: 'tool-result',
            toolCallId: toolEvent.toolCallId,
            toolName: toolEvent.toolName,
            result: unwrapToolOutput(toolEvent.output),
          });
        }
        } else if (part.type === 'error') {
          onEvent({ type: 'error', message: String((part as { error: unknown }).error) });
        }
      }
      onEvent(abortController.signal.aborted ? { type: 'aborted' } : { type: 'done' });
    } catch (err) {
      onEvent(abortController.signal.aborted ? { type: 'aborted' } : { type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (this.activeAbortController === abortController) this.activeAbortController = null;
    }
  }
}
