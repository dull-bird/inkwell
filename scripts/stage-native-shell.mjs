import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const executableName = process.platform === 'win32' ? 'inkwell-native-shell.exe' : 'inkwell-native-shell';
const bundleName = 'inkwell-native-shell.app';
const buildRoot = resolve('native/build/inkwell-shell');
const buildLibDir = join(buildRoot, 'lib');
const rendererDistDir = resolve('dist');
const outputDir = resolve('native/dist', `${process.platform}-${process.arch}`);

const candidates =
  process.platform === 'darwin'
    ? [
        join(buildRoot, bundleName),
        join(buildRoot, 'Release', bundleName),
        join(buildRoot, executableName),
        join(buildRoot, 'Release', executableName),
      ]
    : [
        join(buildRoot, executableName),
        join(buildRoot, 'Release', executableName),
        join(buildRoot, 'RelWithDebInfo', executableName),
        join(buildRoot, 'Debug', executableName),
      ];

const sourcePath = candidates.find((candidate) => existsSync(candidate));

if (!sourcePath) {
  throw new Error(
    [
      'Native shell binary not found. Expected one of:',
      ...candidates.map((candidate) => `- ${candidate}`),
      'Run `npm run native:shell:configure && npm run native:shell:build` first.',
    ].join('\n'),
  );
}

mkdirSync(outputDir, { recursive: true });

if (process.platform === 'darwin' && sourcePath.endsWith('.app')) {
  const outputPath = join(outputDir, basename(sourcePath));
  rmSync(outputPath, { recursive: true, force: true });
  cpSync(sourcePath, outputPath, { recursive: true });
  stageDarwinPdf4QtLibraries(outputPath);
  const agentPanelDir = stageAgentPanelAssets(outputPath);
  console.log(`Staged native Qt shell: ${sourcePath} -> ${outputPath}`);
  console.log(`Staged React agent panel: ${rendererDistDir} -> ${agentPanelDir}`);
} else {
  const outputPath = join(outputDir, executableName);
  mkdirSync(dirname(outputPath), { recursive: true });
  copyFileSync(sourcePath, outputPath);
  if (process.platform !== 'win32') chmodSync(outputPath, 0o755);
  const agentPanelDir = stageAgentPanelAssets(outputPath);
  console.log(`Staged native Qt shell: ${sourcePath} -> ${outputPath}`);
  console.log(`Staged React agent panel: ${rendererDistDir} -> ${agentPanelDir}`);
}

function stageAgentPanelAssets(outputPath) {
  if (!existsSync(rendererDistDir)) {
    throw new Error(
      `Renderer bundle not found at ${rendererDistDir}. Run \`npm run build:renderer\` before \`npm run native:shell:stage\`.`,
    );
  }

  const agentPanelDir =
    process.platform === 'darwin' && outputPath.endsWith('.app')
      ? join(outputPath, 'Contents', 'Resources', 'agent-panel')
      : join(dirname(outputPath), 'agent-panel');

  rmSync(agentPanelDir, { recursive: true, force: true });
  mkdirSync(dirname(agentPanelDir), { recursive: true });
  cpSync(rendererDistDir, agentPanelDir, { recursive: true });
  return agentPanelDir;
}

function stageDarwinPdf4QtLibraries(appPath) {
  if (!existsSync(buildLibDir)) {
    throw new Error(`Native shell library directory not found at ${buildLibDir}.`);
  }

  const frameworksDir = join(appPath, 'Contents', 'Frameworks');
  rmSync(frameworksDir, { recursive: true, force: true });
  mkdirSync(frameworksDir, { recursive: true });

  const pdf4qtLibraries = readdirSync(buildLibDir)
    .filter((entry) => /^libPdf4QtLib.*\.dylib$/.test(entry))
    .sort();

  if (pdf4qtLibraries.length === 0) {
    throw new Error(`No PDF4QT dylibs found in ${buildLibDir}.`);
  }

  for (const libraryName of pdf4qtLibraries) {
    cpSync(join(buildLibDir, libraryName), join(frameworksDir, libraryName), {
      dereference: false,
      force: true,
      recursive: true,
    });
  }

  const executablePath = join(appPath, 'Contents', 'MacOS', executableName);
  rewriteRpath(executablePath, '@executable_path/../Frameworks');

  for (const libraryName of pdf4qtLibraries) {
    const libraryPath = join(frameworksDir, libraryName);
    if (!lstatSync(libraryPath).isSymbolicLink()) {
      rewriteRpath(libraryPath, '@loader_path');
    }
  }
}

function rewriteRpath(binaryPath, relativeRpath) {
  runInstallNameTool(['-delete_rpath', buildLibDir, binaryPath], { allowFailure: true });
  runInstallNameTool(['-delete_rpath', relativeRpath, binaryPath], { allowFailure: true });
  runInstallNameTool(['-add_rpath', relativeRpath, binaryPath]);
}

function runInstallNameTool(args, options = {}) {
  const result = spawnSync('install_name_tool', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status === 0 || options.allowFailure) return;

  const command = ['install_name_tool', ...args].join(' ');
  throw new Error([`Command failed: ${command}`, result.stderr, result.stdout].filter(Boolean).join('\n'));
}
