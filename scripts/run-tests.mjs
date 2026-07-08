import { rmSync, mkdirSync, globSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const outdir = resolve('.tmp/tests');
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const entryPoints = globSync('tests/*.test.ts').sort();
if (entryPoints.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

for (const entryPoint of entryPoints) {
  await build({
    entryPoints: [entryPoint],
    outfile: resolve(outdir, `${basename(entryPoint, '.ts')}.mjs`),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: 'inline',
    external: ['electron'],
    logLevel: 'silent',
  });
}

const testFiles = globSync(`${outdir}/*.mjs`).sort();
const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
