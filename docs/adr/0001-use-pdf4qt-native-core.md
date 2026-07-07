# ADR 0001: Use PDF4QT as the Native PDF Core

Date: 2026-07-08

## Status

Accepted for native spike.

## Context

Inkwell is intended to be a lightweight cross-platform PDF reader/editor with an
agent side panel. The agent should be user-owned, connected through ACP, instead
of being an in-product AI agent that requires Inkwell to manage model accounts,
keys, billing, or tool orchestration.

The current Electron + React + Python + PyMuPDF prototype is useful for product
exploration, but it has two weaknesses:

- PDF rendering and editing behavior is not yet competitive with mature PDF
  readers.
- Agent edits need to appear immediately in the viewer and enter the same undo
  stack as manual edits.

ONLYOFFICE was considered because it already includes office editors, a PDF
editor, and AI assistant concepts. It is not a good base for Inkwell because it
is an office suite, not a small PDF-focused engine. Its PDF implementation is
spread across suite-specific layers such as `sdkjs/pdf`, desktop/web shells,
collaboration, plugins, and document-server integration. Extracting that code
would make Inkwell inherit the size and coupling that the project is trying to
avoid.

PDF4QT is a better fit. Its upstream project describes a PDF rendering library,
viewer/editor applications, document manipulation tools, and a command-line tool
implemented in C++/Qt. It is PDF-specific and MIT licensed.

Sources:

- PDF4QT: https://github.com/JakubMelka/PDF4QT
- PDF4QT project site: https://jakubmelka.github.io/
- ONLYOFFICE Desktop Editors: https://github.com/ONLYOFFICE/DesktopEditors
- ONLYOFFICE SDKJS: https://github.com/ONLYOFFICE/sdkjs

## Decision

Use PDF4QT as the native PDF core for the next Inkwell spike.

Inkwell should become a PDF-first desktop app with:

- A native Qt/C++ PDF viewer/editor core based on PDF4QT.
- A thin ACP bridge exposing PDF operations to user-owned agents such as Codex,
  Claude Code, and other ACP-compatible tools.
- A shared edit pipeline where manual edits and agent edits both produce
  undoable document modifications.
- Standard PDF annotations and outputs so files remain compatible with other PDF
  readers.
- No direct writes to the opened source PDF. Save/apply operations should write
  to a sibling output file or an explicit save target.

## Consequences

Positive:

- PDF rendering, text layout, annotations, forms, signatures, page/object tools,
  optimization, and command-line PDF utilities can be built on existing native
  code.
- The existing PDF4QT `PDFUndoRedoManager` gives Inkwell a credible starting
  point for PDF Expert-style undo/redo.
- Agent edits can be implemented as native PDF operations that emit the same
  document-modified events as manual tools.
- The project avoids building or maintaining a general-purpose AI agent.

Negative:

- Official PDF4QT support is Windows/Linux oriented; macOS support will be
  Inkwell's responsibility unless patches are accepted upstream.
- The current Electron/Python prototype cannot be the final architecture without
  either embedding native PDF4QT or being replaced by a Qt shell.
- Inkwell will need a careful wrapper layer so PDF4QT internals do not leak into
  the ACP tool contract.

## Implementation Notes

The first native spike should target this vertical slice:

1. Open a PDF in the native viewer.
2. Find heading-like text blocks.
3. Create standard highlight annotations for those blocks.
4. Update the current document immediately in the viewer.
5. Push the operation into the undo/redo stack.
6. Save to a sibling output PDF without mutating the original file.

The ACP-facing command can start as:

```json
{
  "tool": "pdf.highlight_headings",
  "input": {
    "document": "current",
    "color": "yellow",
    "opacity": 0.25
  }
}
```

The native side should return a structured operation result with page numbers,
matched text, annotation ids, and an undo token.
