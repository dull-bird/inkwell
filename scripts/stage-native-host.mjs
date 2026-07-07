import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const executableName = process.platform === 'win32' ? 'inkwell-pdf4qt-host.exe' : 'inkwell-pdf4qt-host';
const buildRoot = resolve('native/build/pdf4qt-host');
const outputPath = resolve('native/dist', `${process.platform}-${process.arch}`, executableName);

const candidates = [
  join(buildRoot, executableName),
  join(buildRoot, 'Release', executableName),
  join(buildRoot, 'RelWithDebInfo', executableName),
  join(buildRoot, 'Debug', executableName),
];

const sourcePath = candidates.find((candidate) => existsSync(candidate));
if (!sourcePath) {
  throw new Error(
    [
      `Native host binary not found. Expected one of:`,
      ...candidates.map((candidate) => `- ${candidate}`),
      'Run `npm run native:configure && npm run native:build` first.',
    ].join('\n'),
  );
}

mkdirSync(dirname(outputPath), { recursive: true });
copyFileSync(sourcePath, outputPath);
if (process.platform !== 'win32') chmodSync(outputPath, 0o755);

console.log(`Staged native PDF host: ${sourcePath} -> ${outputPath}`);
