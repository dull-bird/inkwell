import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { app } from 'electron';
import { createACPProvider, acpTools } from '@mcpc-tech/acp-ai-provider';
import type { NewSessionResponse } from '@agentclientprotocol/sdk';
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
export type AgentReasoningLevel = 'auto' | 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export interface AgentPromptOptions {
  modelId?: string;
  modeId?: string;
  reasoningLevel?: AgentReasoningLevel;
}

export interface AgentCatalog {
  models: Array<{ id: string; name: string }>;
  modes: Array<{ id: string; name: string }>;
  currentModelId?: string;
  currentModeId?: string;
  unavailableReason?: string;
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
    case 'xhigh':
      return '[Inkwell: Reasoning intensity requested: xhigh. Use the deepest available reasoning for difficult document understanding and edits.]';
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

  async getCatalog(): Promise<AgentCatalog> {
    try {
      const session = await this.provider.initSession();
      return normalizeAgentCatalog(session);
    } catch (error) {
      return {
        models: [],
        modes: [],
        unavailableReason: error instanceof Error ? error.message : String(error),
      };
    }
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
    const countHighlightRects = (operations: unknown[]): number =>
      operations.reduce<number>((total, operation) => {
        if (!operation || typeof operation !== 'object' || !('rects' in operation)) return total;
        const rects = (operation as { rects?: unknown }).rects;
        return total + (Array.isArray(rects) ? rects.length : 0);
      }, 0);

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
          '(page + bounding boxes) that would highlight them. This does NOT modify the file. Use ' +
          'highlight_pdf_text when the user asks to create and open a highlighted PDF.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          query: z.string().describe('Text to search for.'),
          color: z.array(z.number()).length(3).optional().describe('RGB 0-1 highlight color.'),
        }),
        execute: async ({ path, query, color }) =>
          textResult(await this.backendCall('/highlight', { body: { path: this.resolvePath(path), query, color } })),
      }),
      highlight_pdf_text: tool({
        description:
          'Search exact text, write standard highlight annotations to a new PDF copy, and open that result in Inkwell. ' +
          'Use this for user requests like "highlight X" or "高亮 X" when they expect a highlighted PDF.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          query: z.string().describe('Exact text to highlight.'),
          color: z.array(z.number()).length(3).optional().describe('RGB 0-1 highlight color. Defaults to yellow.'),
        }),
        execute: async ({ path, query, color }) => {
          const resolvedPath = this.resolvePath(path);
          const search = (await this.backendCall('/highlight', {
            body: { path: resolvedPath, query, color },
          })) as { operations?: unknown[] };
          const operations = Array.isArray(search.operations) ? search.operations : [];
          const matchCount = countHighlightRects(operations);
          if (operations.length === 0) {
            return textResult({ ...search, output: null, match_count: 0 });
          }

          const result = (await this.backendCall('/apply', {
            body: { path: resolvedPath, operations },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult({ ...search, ...result, operations, match_count: matchCount });
        },
      }),
      highlight_pdf_headings: tool({
        description:
          'Detect heading-like text blocks, write standard highlight annotations to a new PDF copy, and open that result in Inkwell.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          color: z.array(z.number()).length(3).optional().describe('RGB 0-1 highlight color. Defaults to yellow.'),
          opacity: z.number().min(0).max(1).optional().describe('Highlight opacity. Defaults to 0.25.'),
        }),
        execute: async ({ path, color, opacity }) => {
          const resolvedPath = this.resolvePath(path);
          const search = (await this.backendCall('/highlight-headings', {
            body: { path: resolvedPath, color, opacity },
          })) as { operations?: unknown[] };
          const operations = Array.isArray(search.operations) ? search.operations : [];
          const matchCount = countHighlightRects(operations);
          if (operations.length === 0) {
            return textResult({ ...search, output: null, match_count: 0 });
          }

          const result = (await this.backendCall('/apply', {
            body: { path: resolvedPath, operations },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult({ ...search, ...result, operations, match_count: matchCount });
        },
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
      add_pdf_free_text: tool({
        description:
          'Add visible FreeText annotation content on the PDF page and save a new "<name>_free_text.pdf" copy. ' +
          'Use this when the user wants text to appear directly on the page. Coordinates are PDF points, page 0-indexed.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults currently open document.'),
          page: z.number().int().describe('0-indexed page number.'),
          x: z.number().describe('X coordinate in PDF points from left edge.'),
          y: z.number().describe('Y coordinate in PDF points from top edge.'),
          text: z.string().describe('Visible text to place on the PDF page.'),
          author: z.string().optional().describe('Annotation author. Defaults Sparrow.'),
        }),
        execute: async ({ path, page, x, y, text, author }) => {
          const result = (await this.backendCall('/free-text', {
            body: { path: this.resolvePath(path), page, x, y, text, author },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      add_pdf_stamp: tool({
        description:
          'Add a standard PDF Stamp annotation (Approved, Draft, Confidential, Final, NotApproved, etc.) and save ' +
          'a new "<name>_stamped.pdf" copy. Use page/x/y coordinates in PDF points, page 0-indexed.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults currently open document.'),
          page: z.number().int().describe('0-indexed page number.'),
          x: z.number().describe('X coordinate in PDF points from left edge.'),
          y: z.number().describe('Y coordinate in PDF points from top edge.'),
          stamp: z
            .enum([
              'Approved',
              'Draft',
              'Confidential',
              'Final',
              'NotApproved',
              'ForComment',
              'ForPublicRelease',
              'NotForPublicRelease',
              'TopSecret',
              'Expired',
            ])
            .default('Approved')
            .describe('Standard PDF stamp appearance.'),
          author: z.string().optional().describe('Annotation author. Defaults Sparrow.'),
        }),
        execute: async ({ path, page, x, y, stamp, author }) => {
          const result = (await this.backendCall('/stamp', {
            body: { path: this.resolvePath(path), page, x, y, stamp, author },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      add_pdf_shape: tool({
        description:
          'Add a standard PDF shape annotation (rectangle, ellipse, or line) and save a new "<name>_shaped.pdf" copy. ' +
          'Use page/x/y coordinates in PDF points, page 0-indexed. Width and height are PDF points.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults currently open document.'),
          page: z.number().int().describe('0-indexed page number.'),
          x: z.number().describe('X coordinate in PDF points from left edge.'),
          y: z.number().describe('Y coordinate in PDF points from top edge.'),
          kind: z.enum(['rectangle', 'ellipse', 'line']).default('rectangle').describe('Shape annotation kind.'),
          width: z.number().positive().default(160).describe('Shape width, or line dx, in PDF points.'),
          height: z.number().default(90).describe('Shape height, or line dy, in PDF points.'),
          color: z.array(z.number()).length(3).optional().describe('RGB 0-1 stroke color. Defaults to blue.'),
          stroke_width: z.number().positive().optional().describe('Stroke width in PDF points. Defaults to 2.'),
          author: z.string().optional().describe('Annotation author. Defaults Sparrow.'),
        }),
        execute: async ({ path, page, x, y, kind, width, height, color, stroke_width, author }) => {
          const result = (await this.backendCall('/shape', {
            body: {
              path: this.resolvePath(path),
              page,
              x,
              y,
              kind,
              width,
              height,
              color,
              stroke_width,
              author,
            },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      insert_pdf_image: tool({
        description:
          'Insert a local image file as visible PDF page content and save a new "<name>_image.pdf" copy. ' +
          'Use page/x/y coordinates in PDF points, page 0-indexed. Width and height are PDF points.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults currently open document.'),
          page: z.number().int().describe('0-indexed page number.'),
          x: z.number().describe('X coordinate in PDF points from left edge.'),
          y: z.number().describe('Y coordinate in PDF points from top edge.'),
          image_path: z.string().describe('Absolute local image path to insert.'),
          width: z.number().positive().default(180).describe('Image box width in PDF points.'),
          height: z.number().positive().default(120).describe('Image box height in PDF points.'),
        }),
        execute: async ({ path, page, x, y, image_path, width, height }) => {
          const result = (await this.backendCall('/insert-image', {
            body: { path: this.resolvePath(path), page, x, y, image_path, width, height },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      underline_pdf_text: tool({
        description:
          'Underline every exact match of text in the PDF with standard Underline annotations, saved as ' +
          '"<name>_underlined.pdf". Use this for visible review markup that should stay compatible with PDF readers.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults currently open document.'),
          query: z.string().describe('Exact text to underline wherever it appears.'),
        }),
        execute: async ({ path, query }) => {
          const result = (await this.backendCall('/text-markup', {
            body: {
              path: this.resolvePath(path),
              query,
              kind: 'underline',
              color: [0.1, 0.45, 0.95],
              author: 'Sparrow',
            },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      strikeout_pdf_text: tool({
        description:
          'Strike out every exact match of text in the PDF with standard StrikeOut annotations, saved as ' +
          '"<name>_strikeout.pdf". Use this for visible deletion/revision markup.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults currently open document.'),
          query: z.string().describe('Exact text to strike out wherever it appears.'),
        }),
        execute: async ({ path, query }) => {
          const result = (await this.backendCall('/text-markup', {
            body: {
              path: this.resolvePath(path),
              query,
              kind: 'strikeout',
              color: [0.85, 0.12, 0.12],
              author: 'Sparrow',
            },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      redact_pdf_text: tool({
        description:
          'Permanently remove exact text matches by applying PDF redactions and save a new "<name>_redacted.pdf" copy. ' +
          'Use this for confidential information. The original PDF is never overwritten.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults currently open document.'),
          query: z.string().describe('Exact text to redact wherever it appears.'),
          page_indices: z
            .array(z.number().int())
            .optional()
            .describe('Optional 0-indexed page numbers to limit redaction. Omit to redact every page.'),
        }),
        execute: async ({ path, query, page_indices }) => {
          const result = (await this.backendCall('/redact', {
            body: { path: this.resolvePath(path), query, page_indices },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      add_typed_signature: tool({
        description:
          'Add a visible typed signature as a standard FreeText annotation and save a new "<name>_signed.pdf" copy. ' +
          'Use page/x/y coordinates in PDF points, page 0-indexed. This is not a certificate-based digital signature.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults to the currently open document.'),
          page: z.number().int().describe('0-indexed page number.'),
          x: z.number().describe('X coordinate in PDF points from the left edge.'),
          y: z.number().describe('Y coordinate in PDF points from the top edge.'),
          text: z.string().describe('Visible signature text.'),
          signer: z.string().optional().describe('Signer metadata. Defaults to signature text.'),
        }),
        execute: async ({ path, page, x, y, text, signer }) => {
          const result = (await this.backendCall('/signature', {
            body: { path: this.resolvePath(path), page, x, y, text, signer: signer ?? text },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      add_image_signature: tool({
        description:
          'Add a visible image signature from a local image file and save a new "<name>_image_signed.pdf" copy. ' +
          'Use page/x/y coordinates in PDF points, page 0-indexed. This is not a certificate-based digital signature.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path PDF. Defaults to the currently open document.'),
          page: z.number().int().describe('0-indexed page number.'),
          x: z.number().describe('X coordinate in PDF points from the left edge.'),
          y: z.number().describe('Y coordinate in PDF points from the top edge.'),
          image_path: z.string().describe('Absolute local image path to use as the visible signature.'),
          width: z.number().positive().default(180).describe('Signature image box width in PDF points.'),
          height: z.number().positive().default(60).describe('Signature image box height in PDF points.'),
          signer: z.string().optional().describe('Signer metadata. Defaults to Sparrow.'),
        }),
        execute: async ({ path, page, x, y, image_path, width, height, signer }) => {
          const result = (await this.backendCall('/image-signature', {
            body: {
              path: this.resolvePath(path),
              page,
              x,
              y,
              image_path,
              width,
              height,
              signer: signer ?? 'Sparrow',
            },
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
      extract_pdf_pages: tool({
        description:
          'Extract selected pages into one new PDF, saved as "<name>_extracted.pdf". ' +
          'Use 0-indexed page numbers in the output order. The original PDF is never overwritten.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          page_indices: z
            .array(z.number().int().min(0))
            .min(1)
            .describe('0-indexed page numbers to copy into the new PDF, e.g. [1, 2, 3] for pages 2-4.'),
        }),
        execute: async ({ path, page_indices }) => {
          const result = (await this.backendCall('/extract-pages', {
            body: { path: this.resolvePath(path), page_indices },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      insert_blank_pdf_pages: tool({
        description:
          'Insert one or more blank pages at a 0-indexed output position, saved as "<name>_blank_pages.pdf". ' +
          'insert_index 0 inserts before the first page; page_count inserts after the last page. ' +
          'Omit width/height to reuse the neighboring page size.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          insert_index: z.number().int().min(0).describe('0-indexed output insertion position.'),
          count: z.number().int().min(1).max(100).default(1).describe('Number of blank pages to insert.'),
          width: z.number().positive().optional().describe('Optional blank page width in PDF points.'),
          height: z.number().positive().optional().describe('Optional blank page height in PDF points.'),
        }),
        execute: async ({ path, insert_index, count, width, height }) => {
          const result = (await this.backendCall('/insert-blank-pages', {
            body: { path: this.resolvePath(path), insert_index, count, width, height },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      resize_pdf_pages: tool({
        description:
          'Resize selected pages to width/height in PDF points, saved as "<name>_resized.pdf". ' +
          'Omit page_indices to resize every page.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          width: z.number().positive().describe('Target page width in PDF points.'),
          height: z.number().positive().describe('Target page height in PDF points.'),
          page_indices: z
            .array(z.number().int().min(0))
            .optional()
            .describe('0-indexed pages to resize. Omit to resize every page.'),
        }),
        execute: async ({ path, width, height, page_indices }) => {
          const result = (await this.backendCall('/resize-pages', {
            body: { path: this.resolvePath(path), width, height, page_indices },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      read_pdf_outline: tool({
        description: 'Read the PDF outline/bookmarks as level/title/page JSON entries.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
        }),
        execute: async ({ path }) =>
          textResult(await this.backendCall('/outline', { body: { path: this.resolvePath(path) } })),
      }),
      set_pdf_outline: tool({
        description:
          'Replace the PDF outline/bookmarks and save a new "<name>_outlined.pdf" copy. ' +
          'Outline pages are 1-indexed. Use this when the user asks to add, repair, or rewrite bookmarks.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          outline: z
            .array(
              z.object({
                level: z.number().int().min(1).describe('Outline hierarchy level. Top level is 1.'),
                title: z.string().min(1).describe('Bookmark title.'),
                page: z.number().int().min(1).describe('1-indexed destination page.'),
                x: z.number().optional().describe('Optional destination x coordinate.'),
                y: z.number().optional().describe('Optional destination y coordinate.'),
              }),
            )
            .describe('Full replacement outline. Pass [] to clear the outline.'),
        }),
        execute: async ({ path, outline }) => {
          const result = (await this.backendCall('/set-outline', {
            body: { path: this.resolvePath(path), outline },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      list_pdf_attachments: tool({
        description: 'List embedded file attachments in the PDF, including names, filenames, descriptions, and sizes.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
        }),
        execute: async ({ path }) =>
          textResult(await this.backendCall('/attachments', { body: { path: this.resolvePath(path) } })),
      }),
      add_pdf_attachment: tool({
        description:
          'Embed a local file as a PDF attachment and save a new "<name>_attached.pdf" copy. ' +
          'The original PDF is never overwritten.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          file_path: z.string().describe('Absolute path of the local file to embed as an attachment.'),
          name: z.string().optional().describe('Optional attachment name inside the PDF. Defaults to the file name.'),
          description: z.string().default('').describe('Optional attachment description.'),
        }),
        execute: async ({ path, file_path, name, description }) => {
          const result = (await this.backendCall('/add-attachment', {
            body: { path: this.resolvePath(path), file_path, name, description },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      extract_pdf_attachments: tool({
        description:
          'Extract PDF embedded file attachments into an output directory. Omit names to extract every attachment.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          output_dir: z.string().optional().describe('Directory to write attachments to. Defaults to a temp directory.'),
          names: z.array(z.string()).optional().describe('Attachment names to extract. Omit to extract all attachments.'),
        }),
        execute: async ({ path, output_dir, names }) =>
          textResult(
            await this.backendCall('/extract-attachments', {
              body: { path: this.resolvePath(path), output_dir, names },
            }),
          ),
      }),
      remove_pdf_attachments: tool({
        description:
          'Remove named embedded PDF attachments and save a new "<name>_attachments_removed.pdf" copy.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          names: z.array(z.string()).min(1).describe('Attachment names to remove.'),
        }),
        execute: async ({ path, names }) => {
          const result = (await this.backendCall('/remove-attachments', {
            body: { path: this.resolvePath(path), names },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      crop_pdf_pages: tool({
        description:
          'Crop pages by non-negative margins in PDF points, saved as "<name>_cropped.pdf". ' +
          'Omit page_indices to crop every page; otherwise pass 0-indexed pages to crop.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          margins: z.object({
            left: z.number().min(0).default(0).describe('Left crop margin in PDF points.'),
            top: z.number().min(0).default(0).describe('Top crop margin in PDF points.'),
            right: z.number().min(0).default(0).describe('Right crop margin in PDF points.'),
            bottom: z.number().min(0).default(0).describe('Bottom crop margin in PDF points.'),
          }),
          page_indices: z
            .array(z.number().int().min(0))
            .optional()
            .describe('0-indexed pages to crop. Omit to crop every page.'),
        }),
        execute: async ({ path, margins, page_indices }) => {
          const result = (await this.backendCall('/crop', {
            body: { path: this.resolvePath(path), margins, page_indices },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      compress_pdf: tool({
        description:
          'Optimize and losslessly compress a PDF, saved as "<name>_compressed.pdf". ' +
          'Returns input/output sizes and saved byte/percent statistics.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
        }),
        execute: async ({ path }) => {
          const result = (await this.backendCall('/compress', {
            body: { path: this.resolvePath(path) },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      export_pdf_pages_as_images: tool({
        description:
          'Render PDF pages to PNG images in an output directory. Omit page_indices to export every page. ' +
          'Use this for PDF-to-image conversion requests.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          output_dir: z.string().optional().describe('Directory to write PNG files to. Defaults to a temp directory.'),
          page_indices: z
            .array(z.number().int().min(0))
            .optional()
            .describe('0-indexed pages to export. Omit to export every page.'),
          dpi: z.number().int().min(24).max(600).default(144).describe('PNG rendering DPI. Defaults to 144.'),
        }),
        execute: async ({ path, output_dir, page_indices, dpi }) =>
          textResult(
            await this.backendCall('/export-images', {
              body: { path: this.resolvePath(path), output_dir, page_indices, dpi },
            }),
          ),
      }),
      extract_pdf_images: tool({
        description:
          'Extract embedded image resources from a PDF into an output directory without rendering whole pages. ' +
          'Use this when the user asks to pull original images, figures, or pictures out of a PDF.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          output_dir: z.string().optional().describe('Directory to write extracted image files to. Defaults to a temp directory.'),
          page_indices: z
            .array(z.number().int().min(0))
            .optional()
            .describe('0-indexed pages to scan. Omit to scan every page.'),
        }),
        execute: async ({ path, output_dir, page_indices }) =>
          textResult(
            await this.backendCall('/extract-images', {
              body: { path: this.resolvePath(path), output_dir, page_indices },
            }),
          ),
      }),
      export_pdf_text: tool({
        description:
          'Export extracted PDF text to a Markdown or plain TXT file. Omit page_indices to export every page. ' +
          'Use this for PDF-to-Markdown or PDF-to-text conversion requests.',
        inputSchema: z.object({
          path: z.string().optional().describe('Absolute path to the PDF. Defaults to the currently open document.'),
          format: z.enum(['markdown', 'text']).default('markdown').describe('Output text format.'),
          page_indices: z
            .array(z.number().int().min(0))
            .optional()
            .describe('0-indexed pages to export. Omit to export every page.'),
        }),
        execute: async ({ path, format, page_indices }) =>
          textResult(
            await this.backendCall('/export-text', {
              body: { path: this.resolvePath(path), format, page_indices },
            }),
          ),
      }),
      create_pdf_from_images: tool({
        description:
          'Create a PDF from local image files, one image per page, saved as a new PDF. ' +
          'Use this for image-to-PDF conversion requests.',
        inputSchema: z.object({
          image_paths: z.array(z.string()).min(1).describe('Absolute local image paths to convert, in page order.'),
          width: z.number().positive().default(595).describe('Output PDF page width in points.'),
          height: z.number().positive().default(842).describe('Output PDF page height in points.'),
          margin: z.number().min(0).default(36).describe('Page margin in points.'),
        }),
        execute: async ({ image_paths, width, height, margin }) => {
          const result = (await this.backendCall('/images-to-pdf', {
            body: { image_paths, width, height, margin },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      convert_html_to_pdf: tool({
        description:
          'Render supplied HTML content into a new PDF. Use for HTML-to-PDF conversion requests.',
        inputSchema: z.object({
          html: z.string().min(1).describe('HTML content to render.'),
          title: z.string().default('Inkwell HTML Export').describe('PDF metadata title.'),
          width: z.number().positive().default(595).describe('Output PDF page width in points.'),
          height: z.number().positive().default(842).describe('Output PDF page height in points.'),
          margin: z.number().min(0).default(36).describe('Page margin in points.'),
        }),
        execute: async ({ html, title, width, height, margin }) => {
          const result = (await this.backendCall('/html-to-pdf', {
            body: { html, title, width, height, margin },
          })) as { output: string };
          notifyOutput(result.output);
          return textResult(result);
        },
      }),
      convert_markdown_to_pdf: tool({
        description:
          'Convert supplied Markdown content into a new PDF. Use for Markdown-to-PDF conversion requests.',
        inputSchema: z.object({
          markdown: z.string().min(1).describe('Markdown content to convert.'),
          title: z.string().default('Inkwell Markdown Export').describe('PDF metadata title.'),
          width: z.number().positive().default(595).describe('Output PDF page width in points.'),
          height: z.number().positive().default(842).describe('Output PDF page height in points.'),
          margin: z.number().min(0).default(36).describe('Page margin in points.'),
        }),
        execute: async ({ markdown, title, width, height, margin }) => {
          const result = (await this.backendCall('/markdown-to-pdf', {
            body: { markdown, title, width, height, margin },
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
          'For user-visible highlighting, use highlight_pdf_text or highlight_pdf_headings so Inkwell opens the highlighted PDF. ' +
          'Use find_pdf_text only when the user explicitly asks to search or preview matches without writing a PDF.]'
        : '[Inkwell: no PDF is currently open in the viewer.]';
      const { fullStream } = streamText({
        model: this.provider.languageModel(options.modelId, options.modeId),
        system: this.currentPdfPath
          ? `The user currently has a PDF open in Inkwell at: ${this.currentPdfPath}. When they refer to ` +
            '"this PDF", "the document", "it", etc. without giving a path, operate on that file directly — ' +
            'do not ask them for a path or a URL first. For visual highlight requests, use highlight_pdf_text ' +
            'for exact text or highlight_pdf_headings for headings; these write and open a highlighted PDF copy. ' +
            'Use preview-only tools only when the user explicitly asks to preview/search before writing. ' +
            'For form filling, image insertion, typed signatures, and image signatures, save only the sibling output PDF. ' +
            'Typed and image signatures are visible signatures, not certificate-based digital signatures.'
          : 'No PDF is currently open in Inkwell. If the user refers to "the PDF" without specifying one, ' +
            'tell them to open a file first.',
        prompt: [pdfContext, reasoningInstruction(options.reasoningLevel), prompt].filter(Boolean).join('\n\n'),
        tools: this.buildTools(onEvent),
        abortSignal: abortController.signal,
      });

      const toolCallsById = new Map<string, { toolName: string; args: unknown }>();
      for await (const part of fullStream) {
        if (abortController.signal.aborted) break;
        if (part.type === 'text-delta') {
          onEvent({ type: 'text-delta', text: part.text });
        } else if (part.type === 'reasoning-delta') {
          onEvent({ type: 'reasoning-delta', text: part.text });
      } else if (part.type === 'tool-call' || part.type === 'tool-result') {
        const toolEvent = extractInkwellToolEvent(part);
        const fallbackToolCall = !toolEvent && part.type === 'tool-result' ? toolCallsById.get(getToolCallId(part) ?? '') : undefined;
        if (!toolEvent && !fallbackToolCall) continue;
        if (part.type === 'tool-call') {
          if (toolEvent) toolCallsById.set(toolEvent.toolCallId, { toolName: toolEvent.toolName, args: toolEvent.args });
          onEvent({
            type: 'tool-call',
            toolCallId: toolEvent!.toolCallId,
            toolName: toolEvent!.toolName,
            args: toolEvent!.args,
          });
        } else {
          const toolCallId = toolEvent?.toolCallId ?? getToolCallId(part);
          const toolName = toolEvent?.toolName ?? fallbackToolCall?.toolName;
          if (!toolCallId || !toolName) continue;
          onEvent({
            type: 'tool-result',
            toolCallId,
            toolName,
            result: unwrapToolOutput(toolEvent ? toolEvent.output : getToolOutput(part)),
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

function getToolCallId(part: unknown): string | null {
  if (!isRecord(part)) return null;
  const value = part.toolCallId ?? part.id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getToolOutput(part: unknown): unknown {
  return isRecord(part) ? part.output ?? part.result : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeAgentCatalog(session: NewSessionResponse): AgentCatalog {
  return {
    models:
      session.models?.availableModels.map((model) => ({
        id: model.modelId,
        name: model.name || model.modelId,
      })) ?? [],
    modes:
      session.modes?.availableModes.map((mode) => ({
        id: mode.id,
        name: mode.name || mode.id,
      })) ?? [],
    currentModelId: session.models?.currentModelId,
    currentModeId: session.modes?.currentModeId,
  };
}
