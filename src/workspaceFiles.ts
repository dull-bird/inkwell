export type WorkspaceFileKind = 'folder' | 'pdf' | 'markdown' | 'other';

export interface WorkspaceTreeNode {
  id: string;
  name: string;
  path: string;
  kind: WorkspaceFileKind;
  children?: WorkspaceTreeNode[];
}

export interface WorkspaceTree {
  rootName: string;
  rootPath: string | null;
  children: WorkspaceTreeNode[];
}

export function normalizePdfPaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter((path) => /\.pdf$/i.test(path)))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

export function detectWorkspaceFileKind(path: string): WorkspaceFileKind {
  if (/\.pdf$/i.test(path)) return 'pdf';
  if (/\.(md|markdown)$/i.test(path)) return 'markdown';
  return 'other';
}

export function normalizeWorkspacePaths(paths: string[]): string[] {
  return Array.from(
    new Set(paths.filter((path) => detectWorkspaceFileKind(path) !== 'other')),
  ).sort(compareWorkspaceNodes);
}

export function buildWorkspaceTree(paths: string[], explicitRootPath?: string): WorkspaceTree {
  const normalized = normalizeWorkspacePaths(paths);
  const rootPath = explicitRootPath ?? commonParentDirectory(normalized);
  const rootName = rootPath ? basename(rootPath) : 'Workspace';
  const children: WorkspaceTreeNode[] = [];

  for (const path of normalized) {
    const relative = rootPath ? stripRoot(path, rootPath) : path;
    const parts = splitPath(relative);
    if (parts.length === 0) continue;
    insertNode(children, rootPath, parts, path);
  }

  sortTree(children);
  return { rootName, rootPath, children };
}

function insertNode(
  siblings: WorkspaceTreeNode[],
  currentDirectory: string | null,
  parts: string[],
  fullPath: string,
): void {
  const [name, ...rest] = parts;
  if (!name) return;

  if (rest.length === 0) {
    siblings.push({
      id: fullPath,
      name,
      path: fullPath,
      kind: detectWorkspaceFileKind(fullPath),
    });
    return;
  }

  const folderPath = joinPath(currentDirectory, [name]);
  let folder = siblings.find((node) => node.kind === 'folder' && node.path === folderPath);
  if (!folder) {
    folder = {
      id: folderPath,
      name,
      path: folderPath,
      kind: 'folder',
      children: [],
    };
    siblings.push(folder);
  }
  insertNode(folder.children ?? [], folderPath, rest, fullPath);
}

function sortTree(nodes: WorkspaceTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind === 'folder' && b.kind !== 'folder') return -1;
    if (a.kind !== 'folder' && b.kind === 'folder') return 1;
    return compareWorkspaceNodes(a.name, b.name);
  });
  for (const node of nodes) {
    if (node.children) sortTree(node.children);
  }
}

function compareWorkspaceNodes(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function commonParentDirectory(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const directories = paths.map(dirname);
  const first = splitPath(directories[0] ?? '');
  let commonLength = first.length;

  for (const directory of directories.slice(1)) {
    const parts = splitPath(directory);
    commonLength = Math.min(commonLength, parts.length);
    for (let index = 0; index < commonLength; index += 1) {
      if (first[index] !== parts[index]) {
        commonLength = index;
        break;
      }
    }
  }

  const prefix = first.slice(0, commonLength).join('/');
  if (!prefix) return paths[0]?.startsWith('/') ? '/' : null;
  return paths[0]?.startsWith('/') ? `/${prefix}` : prefix;
}

function dirname(path: string): string {
  const normalized = normalizeSeparators(path);
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return normalized.startsWith('/') ? '/' : '';
  return normalized.slice(0, index);
}

function basename(path: string): string {
  const parts = splitPath(path);
  return parts.at(-1) ?? path;
}

function stripRoot(path: string, rootPath: string): string {
  const normalizedPath = normalizeSeparators(path);
  const normalizedRoot = normalizeSeparators(rootPath).replace(/\/+$/, '');
  if (normalizedRoot === '/') return normalizedPath.replace(/^\/+/, '');
  if (normalizedPath === normalizedRoot) return basename(normalizedPath);
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return normalizedPath;
}

function joinPath(rootPath: string | null, parts: string[]): string {
  const suffix = parts.join('/');
  if (!rootPath) return suffix;
  if (rootPath === '/') return `/${suffix}`;
  return `${rootPath.replace(/\/+$/, '')}/${suffix}`;
}

function splitPath(path: string): string[] {
  return normalizeSeparators(path).split('/').filter(Boolean);
}

function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}
