import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  NATIVE_PDF_COMMANDS,
} from '../shared/native-pdf-commands';
import {
  ELECTRON_NATIVE_PDF_COMMANDS,
  NativePdfHostClient,
  buildNativePdfHostRequest,
  type NativePdfHostProcess,
  type NativePdfHostSpawn,
} from '../electron/nativePdfBridge';

class FakeHostProcess extends EventEmitter implements NativePdfHostProcess {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    this.emit('close', 0);
    return true;
  }
}

function createFakeSpawn(process: FakeHostProcess): { spawn: NativePdfHostSpawn; writtenLines: string[] } {
  const writtenLines: string[] = [];
  process.stdin.on('data', (chunk) => {
    writtenLines.push(...String(chunk).trim().split('\n').filter(Boolean));
  });
  return {
    writtenLines,
    spawn: (command, args) => {
      assert.equal(command, '/tmp/inkwell-pdf4qt-host');
      assert.deepEqual(args, ['--stdio-json']);
      return process;
    },
  };
}

test('builds JSON-RPC native PDF host requests', () => {
  assert.deepEqual(buildNativePdfHostRequest('req-1', 'document_info', { path: '/docs/a.pdf' }), {
    jsonrpc: '2.0',
    id: 'req-1',
    method: 'document_info',
    params: { path: '/docs/a.pdf' },
  });
});

test('keeps Electron bridge command list aligned with shared protocol', () => {
  assert.deepEqual(ELECTRON_NATIVE_PDF_COMMANDS, NATIVE_PDF_COMMANDS.map((command) => command.name));
});

test('sends command to host and resolves matching chunked JSON response', async () => {
  const process = new FakeHostProcess();
  const { spawn, writtenLines } = createFakeSpawn(process);
  const client = new NativePdfHostClient('/tmp/inkwell-pdf4qt-host', { spawn, requestId: () => 'req-2' });

  const pending = client.execute('document_info', { path: '/docs/a.pdf' });
  assert.deepEqual(JSON.parse(writtenLines[0]), {
    jsonrpc: '2.0',
    id: 'req-2',
    method: 'document_info',
    params: { path: '/docs/a.pdf' },
  });

  process.stdout.write('{"jsonrpc":"2.0","id":"req-2","result":{"page_count":');
  process.stdout.write('3}}\n');

  assert.deepEqual(await pending, { page_count: 3 });
});

test('rejects host error responses', async () => {
  const process = new FakeHostProcess();
  const { spawn } = createFakeSpawn(process);
  const client = new NativePdfHostClient('/tmp/inkwell-pdf4qt-host', { spawn, requestId: () => 'req-3' });

  const pending = client.execute('open_document', { path: '/missing.pdf' });
  process.stdout.write('{"jsonrpc":"2.0","id":"req-3","error":{"message":"file not found"}}\n');

  await assert.rejects(pending, /file not found/);
});

test('rejects pending calls when host exits', async () => {
  const process = new FakeHostProcess();
  const { spawn } = createFakeSpawn(process);
  const client = new NativePdfHostClient('/tmp/inkwell-pdf4qt-host', { spawn, requestId: () => 'req-4' });

  const pending = client.execute('document_info', { path: '/docs/a.pdf' });
  process.emit('close', 9);

  await assert.rejects(pending, /exited/);
});
