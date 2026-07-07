# Markdown Notes And Agent Handoff

Sparrow should support Markdown because PDF reading often creates notes that
need to leave the app with the document context. The first implementation keeps
Markdown lightweight:

- session notes are plain Markdown text owned by the renderer;
- native-agent export writes `notes.md`, `handoff.md`, and `next-prompt.txt`;
- PDF files are referenced or copied only after an explicit user choice;
- Markdown files discovered in a workspace appear in the file tree, but are not
  edited in-place yet.

This avoids pulling a large editor stack into the first usable product. The app
already depends on `react-markdown`, which is enough for preview surfaces. When
full Markdown editing is needed, prefer a small editor layer over a full IDE-like
dependency.

For Markdown-to-PDF export, the preferred path is:

1. Render Markdown to controlled HTML with app-owned CSS.
2. Use Electron `webContents.printToPDF`.
3. Save through an explicit export dialog.

This keeps export quality close to Chromium print output, avoids another PDF
generation dependency, and works across macOS, Windows, and Linux.
