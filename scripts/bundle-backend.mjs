import { existsSync, mkdirSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const python = process.env.INKWELL_PYTHON || process.env.PYTHON || '/usr/bin/python3';
const platformArch = `${process.platform}-${process.arch}`;
const executableName = process.platform === 'win32' ? 'inkwell-backend.exe' : 'inkwell-backend';
const distRoot = resolve('backend/dist', platformArch);
const workRoot = resolve('backend/build/pyinstaller');
const entrypoint = resolve('backend/inkwell_backend_entry.py');

mkdirSync(distRoot, { recursive: true });
mkdirSync(workRoot, { recursive: true });

const pyinstallerCheck = spawnSync(python, ['-m', 'PyInstaller', '--version'], { encoding: 'utf8' });
if (pyinstallerCheck.status !== 0) {
  throw new Error(
    [
      'PyInstaller is required to bundle the backend executable.',
      `Tried: ${python} -m PyInstaller --version`,
      'Install it in the backend environment, for example: /usr/bin/python3 -m pip install pyinstaller',
    ].join('\n'),
  );
}

const args = [
  '-m',
  'PyInstaller',
  '--noconfirm',
  '--clean',
  '--onefile',
  '--name',
  'inkwell-backend',
  '--distpath',
  distRoot,
  '--workpath',
  workRoot,
  '--specpath',
  workRoot,
  entrypoint,
];

const result = spawnSync(python, args, {
  stdio: 'inherit',
  env: { ...process.env, PYTHONPATH: [resolve('backend'), process.env.PYTHONPATH].filter(Boolean).join(delimiter) },
});

if (result.status !== 0) {
  throw new Error(`Backend bundle failed with exit code ${result.status ?? 'unknown'}.`);
}

const outputPath = join(distRoot, executableName);
if (!existsSync(outputPath)) {
  throw new Error(`Expected bundled backend executable was not created: ${outputPath}`);
}

console.log(`Bundled backend executable: ${outputPath}`);
