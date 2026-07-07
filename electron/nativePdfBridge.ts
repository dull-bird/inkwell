import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export type NativePdfCommandName =
  | 'open_document'
  | 'host_status'
  | 'document_info'
  | 'find_text'
  | 'preview_highlights'
  | 'read_form_fields'
  | 'fill_form'
  | 'typed_signature'
  | 'apply_operations'
  | 'undo'
  | 'redo'
  | 'save_as';

export const ELECTRON_NATIVE_PDF_COMMANDS: NativePdfCommandName[] = [
  'open_document',
  'host_status',
  'document_info',
  'find_text',
  'preview_highlights',
  'read_form_fields',
  'fill_form',
  'typed_signature',
  'apply_operations',
  'undo',
  'redo',
  'save_as',
];

const KNOWN_NATIVE_PDF_COMMANDS = new Set<NativePdfCommandName>(ELECTRON_NATIVE_PDF_COMMANDS);

export interface NativePdfHostRequest {
  jsonrpc: '2.0';
  id: string;
  method: NativePdfCommandName;
  params: Record<string, unknown>;
}

export interface NativePdfHostProcess {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  killed?: boolean;
  kill: () => boolean;
  on: (event: 'close' | 'error', listener: (...args: unknown[]) => void) => unknown;
}

export type NativePdfHostSpawn = (command: string, args: string[]) => NativePdfHostProcess;

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface NativePdfHostClientOptions {
  spawn?: NativePdfHostSpawn;
  requestId?: () => string;
  timeoutMs?: number;
}

export function buildNativePdfHostRequest(
  id: string,
  method: NativePdfCommandName,
  params: Record<string, unknown> = {},
): NativePdfHostRequest {
  if (!KNOWN_NATIVE_PDF_COMMANDS.has(method)) throw new Error(`Unknown native PDF command: ${method}`);
  return { jsonrpc: '2.0', id, method, params };
}

export class NativePdfHostClient {
  private process: NativePdfHostProcess | null = null;
  private stdoutBuffer = '';
  private pending = new Map<string, PendingCall>();
  private spawnProcess: NativePdfHostSpawn;
  private requestId: () => string;
  private timeoutMs: number;

  constructor(
    private readonly hostPath: string,
    { spawn = defaultSpawn, requestId = randomUUID, timeoutMs = 15_000 }: NativePdfHostClientOptions = {},
  ) {
    this.spawnProcess = spawn;
    this.requestId = requestId;
    this.timeoutMs = timeoutMs;
  }

  execute(method: NativePdfCommandName, params: Record<string, unknown> = {}): Promise<unknown> {
    const request = buildNativePdfHostRequest(this.requestId(), method, params);
    const process = this.ensureStarted();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Native PDF host command timed out: ${method}`));
      }, this.timeoutMs);

      this.pending.set(request.id, { resolve, reject, timeout });
      process.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Native PDF host disposed.'));
    }
    this.pending.clear();
    if (this.process && !this.process.killed) this.process.kill();
    this.process = null;
  }

  private ensureStarted(): NativePdfHostProcess {
    if (this.process) return this.process;
    const process = this.spawnProcess(this.hostPath, ['--stdio-json']);
    this.process = process;
    process.stdout.on('data', (chunk) => this.handleStdout(String(chunk)));
    process.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) console.warn(`[pdf4qt-host] ${text}`);
    });
    process.on('close', (code) => this.rejectAll(new Error(`Native PDF host exited with code ${String(code)}.`)));
    process.on('error', (error) =>
      this.rejectAll(error instanceof Error ? error : new Error(`Native PDF host error: ${String(error)}`)),
    );
    return process;
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline = this.stdoutBuffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.handleLine(line);
      newline = this.stdoutBuffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.rejectAll(new Error(`Native PDF host sent invalid JSON: ${line}`));
      return;
    }
    if (!isRecord(message) || typeof message.id !== 'string') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (isRecord(message.error)) {
      pending.reject(new Error(typeof message.error.message === 'string' ? message.error.message : 'Native PDF host error.'));
      return;
    }
    pending.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
    this.process = null;
  }
}

function defaultSpawn(command: string, args: string[]): NativePdfHostProcess {
  return nodeSpawn(command, args, { stdio: 'pipe' }) as ChildProcessWithoutNullStreams;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
