import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const prefix = process.env.INKWELL_NATIVE_PREFIX || join(homedir(), '.local', 'inkwell-native');
const depsRoot = resolve('native/build/deps');

const deps = [
  {
    name: 'asmjit',
    url: 'https://github.com/asmjit/asmjit.git',
    commit: 'c87860217e43e2a06060fcaae5b468f6a55b9963',
    configureArgs: [],
  },
  {
    name: 'blend2d',
    url: 'https://github.com/blend2d/blend2d.git',
    commit: '6dbc2cefbc996379e07104e34519a440b49b15d7',
    configureArgs: ['-DBLEND2D_EXTERNAL_ASMJIT=ON'],
  },
];

for (const dep of deps) {
  installDependency(dep);
}

console.log(`Native dependencies installed to ${prefix}`);

function installDependency(dep) {
  const sourceDir = join(depsRoot, dep.name);
  const buildDir = join(depsRoot, `${dep.name}-build`);

  if (!existsSync(sourceDir)) {
    run('git', ['clone', dep.url, sourceDir]);
  }

  run('git', ['fetch', '--all', '--tags'], { cwd: sourceDir });
  run('git', ['checkout', dep.commit], { cwd: sourceDir });

  rmSync(buildDir, { recursive: true, force: true });
  run('cmake', [
    '-S',
    sourceDir,
    '-B',
    buildDir,
    '-DCMAKE_BUILD_TYPE=Release',
    `-DCMAKE_INSTALL_PREFIX=${prefix}`,
    ...dep.configureArgs,
  ]);
  run('cmake', ['--build', buildDir, '--config', 'Release', '--parallel', '2']);
  run('cmake', ['--install', buildDir, '--config', 'Release']);
}

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
