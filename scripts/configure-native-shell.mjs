import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceDir = resolve('native/inkwell-shell');
const buildDir = resolve('native/build/inkwell-shell');
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

if (!existsSync(join(pdf4qtRoot, 'Pdf4QtLibGui', 'CMakeLists.txt'))) {
  throw new Error('PDF4QT submodule is missing. Run `git submodule update --init --recursive native/vendor/pdf4qt`.');
}

const enableWebView = extraArgs.includes('--webview');
const passthroughArgs = extraArgs.filter((arg) => arg !== '--webview');

const args = [
  '-S',
  sourceDir,
  '-B',
  buildDir,
  '-DCMAKE_BUILD_TYPE=Release',
  '-DINKWELL_USE_BUNDLED_PDF4QT=ON',
  ...(enableWebView ? ['-DINKWELL_ENABLE_AGENT_WEBVIEW=ON'] : []),
  ...passthroughArgs,
];

console.log(`Configuring Qt/PDF4QT native shell${enableWebView ? ' with agent WebView' : ''}...`);
if (cmakePrefixPath) console.log(`CMAKE_PREFIX_PATH=${cmakePrefixPath}`);
if (env.CC || env.CXX) console.log(`CC=${env.CC || ''} CXX=${env.CXX || ''}`);

const result = spawnSync('cmake', args, { stdio: 'inherit', env });
process.exit(result.status ?? 1);

function findQtPrefixes() {
  const prefixes = new Set();
  for (const root of ['/opt/homebrew/Cellar', '/usr/local/Cellar']) {
    for (const formula of ['qtbase', 'qt', 'qtsvg', 'qtspeech', 'qtmultimedia', 'qtwebengine']) {
      const qtRoot = join(root, formula);
      if (existsSync(qtRoot)) {
        for (const version of readdirSync(qtRoot)) {
          prefixes.add(join(qtRoot, version));
        }
      }
    }
  }
  for (const root of ['/opt/homebrew/opt', '/usr/local/opt']) {
    for (const formula of ['qt', 'qtbase', 'qtsvg', 'qtspeech', 'qtmultimedia', 'qtwebengine']) {
      const prefix = join(root, formula);
      if (existsSync(prefix)) prefixes.add(prefix);
    }
  }
  return Array.from(prefixes).sort().reverse();
}
