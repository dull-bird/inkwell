import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceTree,
  detectWorkspaceFileKind,
  normalizeWorkspacePaths,
} from '../src/workspaceFiles';

test('detects PDF and Markdown workspace file kinds', () => {
  assert.equal(detectWorkspaceFileKind('/work/paper.PDF'), 'pdf');
  assert.equal(detectWorkspaceFileKind('/work/notes/session.markdown'), 'markdown');
  assert.equal(detectWorkspaceFileKind('/work/notes/todo.md'), 'markdown');
  assert.equal(detectWorkspaceFileKind('/work/assets/logo.png'), 'other');
});

test('normalizes supported workspace paths in deterministic order', () => {
  assert.deepEqual(
    normalizeWorkspacePaths([
      '/work/Zeta.pdf',
      '/work/notes.md',
      '/work/Zeta.pdf',
      '/work/archive.zip',
      '/work/alpha.PDF',
    ]),
    ['/work/alpha.PDF', '/work/notes.md', '/work/Zeta.pdf'],
  );
});

test('builds a VS Code style tree from PDF and Markdown paths', () => {
  const tree = buildWorkspaceTree([
    '/Users/lilei/docs/book/chapter-1.pdf',
    '/Users/lilei/docs/book/notes/session.md',
    '/Users/lilei/docs/book/appendix.pdf',
  ]);

  assert.equal(tree.rootName, 'book');
  assert.equal(tree.rootPath, '/Users/lilei/docs/book');
  assert.deepEqual(
    tree.children.map((node) => ({ name: node.name, kind: node.kind })),
    [
      { name: 'notes', kind: 'folder' },
      { name: 'appendix.pdf', kind: 'pdf' },
      { name: 'chapter-1.pdf', kind: 'pdf' },
    ],
  );

  const notes = tree.children[0];
  assert.equal(notes.children?.[0].name, 'session.md');
  assert.equal(notes.children?.[0].kind, 'markdown');
});
