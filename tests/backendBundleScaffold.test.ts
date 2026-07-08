import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('provides a backend executable entrypoint for PyInstaller', () => {
  const entrypoint = resolve('backend/inkwell_backend_entry.py');
  assert.equal(existsSync(entrypoint), true);
  const source = readFileSync(entrypoint, 'utf8');
  assert.match(source, /from inkwell\.server import main/);
  assert.match(source, /main\(\)/);
});

test('provides a backend bundle script that stages platform arch output', () => {
  const scriptPath = resolve('scripts/bundle-backend.mjs');
  assert.equal(existsSync(scriptPath), true);
  const source = readFileSync(scriptPath, 'utf8');
  assert.match(source, /PyInstaller/);
  assert.match(source, /backend\/dist/);
  assert.match(source, /process\.platform/);
  assert.match(source, /process\.arch/);
  assert.match(source, /delimiter/);
  assert.match(source, /inkwell-backend/);
});

test('declares PyInstaller as a backend bundle dependency', () => {
  const pyproject = readFileSync(resolve('backend/pyproject.toml'), 'utf8');
  assert.match(pyproject, /bundle = \[/);
  assert.match(pyproject, /pyinstaller/);
});
