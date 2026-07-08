import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const checks = [];
const localQtPkgConfigPaths = findLocalQtPkgConfigPaths();
const pkgConfigPath = [
  ...localQtPkgConfigPaths,
  process.env.PKG_CONFIG_PATH,
]
  .filter(Boolean)
  .join(delimiter);

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(pkgConfigPath ? { PKG_CONFIG_PATH: pkgConfigPath } : {}),
    },
  });
  return {
    ok: result.status === 0,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
  };
}

function findLocalQtPkgConfigPaths() {
  const qtRoot = join(homedir(), '.local', 'Qt');
  if (!existsSync(qtRoot)) return [];
  return readdirSync(qtRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(qtRoot, entry.name, 'gcc_64', 'lib', 'pkgconfig'))
    .filter((path) => existsSync(path))
    .sort()
    .reverse();
}

function addCheck(name, ok, detail, fix) {
  checks.push({ name, ok, detail, fix });
}

const pdf4qtRoot = resolve('native/vendor/pdf4qt');
addCheck(
  'PDF4QT submodule',
  existsSync(join(pdf4qtRoot, 'Pdf4QtLibCore/CMakeLists.txt')),
  pdf4qtRoot,
  'Run `git submodule update --init --recursive native/vendor/pdf4qt`.',
);

const cmake = run('cmake', ['--version']);
addCheck('CMake', cmake.ok, cmake.output.split('\n')[0] || 'cmake not found', 'Install CMake 3.16 or newer.');

for (const moduleName of ['Qt6Core', 'Qt6Gui', 'Qt6Svg', 'Qt6Xml']) {
  const pkg = run('pkg-config', ['--modversion', moduleName]);
  addCheck(
    moduleName,
    pkg.ok,
    pkg.ok ? pkg.output : 'not found by pkg-config',
    'Install Qt6 development packages and make sure pkg-config can see them.',
  );
}

for (const moduleName of ['openssl', 'zlib']) {
  const pkg = run('pkg-config', ['--modversion', moduleName]);
  addCheck(moduleName, pkg.ok, pkg.ok ? pkg.output : 'not found by pkg-config', `Install ${moduleName} development headers.`);
}

for (const moduleName of ['lcms2', 'libopenjp2', 'freetype2', 'libjpeg', 'libpng']) {
  const pkg = run('pkg-config', ['--modversion', moduleName]);
  addCheck(moduleName, pkg.ok, pkg.ok ? pkg.output : 'not found by pkg-config', `Install ${moduleName} development headers.`);
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const marker = check.ok ? 'ok' : 'missing';
  console.log(`${marker.padEnd(7)} ${check.name}: ${check.detail}`);
  if (!check.ok) console.log(`        ${check.fix}`);
}

if (failed.length > 0) {
  console.error(`\nNative PDF4QT prerequisites missing: ${failed.length}`);
  process.exit(1);
}

console.log('\nNative PDF4QT prerequisites look ready.');
