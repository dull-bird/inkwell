import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const viteBin = resolve('node_modules/vite/bin/vite.js');
const args = process.argv.slice(2);
let child = null;
let restarting = false;
let stopping = false;
let restartTimer = null;
let killTimer = null;
let hardKillTimer = null;

function start() {
  restarting = false;
  child = spawn(process.execPath, [viteBin, ...args], {
    cwd: process.cwd(),
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => handleOutput(chunk, process.stdout));
  child.stderr.on('data', (chunk) => handleOutput(chunk, process.stderr));
  child.on('error', (error) => {
    process.stderr.write(`[dev-server] Failed to start Vite: ${error.message}\n`);
    if (!restarting && !stopping) process.exit(1);
  });
  child.on('exit', (code, signal) => {
    clearTimeout(killTimer);
    clearTimeout(hardKillTimer);
    child = null;
    if (stopping) process.exit(code ?? (signal ? 1 : 0));
    if (restarting) {
      restartTimer = setTimeout(start, 250);
      return;
    }
    process.exit(code ?? 1);
  });
}

function handleOutput(chunk, stream) {
  const text = chunk.toString();
  stream.write(chunk);
  if (text.includes('The service is no longer running')) {
    restartVite();
  }
}

function restartVite() {
  if (restarting || stopping || !child) return;
  restarting = true;
  process.stderr.write('\n[dev-server] Vite esbuild service stopped; restarting dev server.\n');
  signalVite('SIGTERM');
  killTimer = setTimeout(() => {
    signalChildGroup('SIGTERM');
  }, 750);
  hardKillTimer = setTimeout(() => {
    signalChildGroup('SIGKILL');
  }, 3000);
}

function stop() {
  stopping = true;
  clearTimeout(restartTimer);
  if (child) {
    signalChildGroup('SIGTERM');
    return;
  }
  process.exit(0);
}

function signalVite(signal) {
  if (!child) return;
  child.kill(signal);
}

function signalChildGroup(signal) {
  if (!child) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to signaling only the Vite process if process-group cleanup fails.
    }
  }
  child.kill(signal);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

start();
