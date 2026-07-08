import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceDir = resolve('native/pdf4qt-host');
const buildDir = resolve('native/build/pdf4qt-host');
const pdf4qtRoot = resolve('native/vendor/pdf4qt');
const extraArgs = process.argv.slice(2);

const cmakePrefixPath = [
  ...findQtPrefixes(),
  process.env.INKWELL_NATIVE_PREFIX || join(homedir(), '.local', 'inkwell-native'),
  process.env.CMAKE_PREFIX_PATH,
]
  .filter(Boolean)
  .join(delimiter);

const env = {
  ...process.env,
  ...(cmakePrefixPath ? { CMAKE_PREFIX_PATH: cmakePrefixPath } : {}),
};

if (process.platform === 'linux') {
  if (!env.CC && existsSync('/usr/bin/gcc-10')) env.CC = '/usr/bin/gcc-10';
  if (!env.CXX && existsSync('/usr/bin/g++-10')) env.CXX = '/usr/bin/g++-10';
}

const usePdf4qt = extraArgs.includes('--stub')
  ? false
  : existsSync(join(pdf4qtRoot, 'Pdf4QtLibCore', 'CMakeLists.txt'));
const passthroughArgs = extraArgs.filter((arg) => arg !== '--pdf4qt' && arg !== '--stub');

const args = [
  '-S',
  sourceDir,
  '-B',
  buildDir,
  '-DCMAKE_BUILD_TYPE=Release',
  ...(usePdf4qt ? ['-DINKWELL_USE_BUNDLED_PDF4QT=ON'] : []),
  ...passthroughArgs,
];

console.log(`Configuring native PDF host${usePdf4qt ? ' with bundled PDF4QT' : ''}...`);
if (cmakePrefixPath) console.log(`CMAKE_PREFIX_PATH=${cmakePrefixPath}`);
if (env.CC || env.CXX) console.log(`Compiler=${[env.CC, env.CXX].filter(Boolean).join(' / ')}`);

const result = spawnSync('cmake', args, {
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 1);

function findQtPrefixes() {
  const explicitQt = process.env.INKWELL_QT_PREFIX;
  if (explicitQt) return [explicitQt];

  const qtRoot = join(homedir(), '.local', 'Qt');
  if (!existsSync(qtRoot)) return [];

  return readdirSync(qtRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(qtRoot, entry.name, 'gcc_64'))
    .filter((path) => existsSync(path))
    .sort()
    .reverse();
}
