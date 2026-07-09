# Native Shell Target

Inkwell's target product shell is a Qt application, not an Electron PDF viewer.

## Target Shape

```text
Inkwell Qt Shell
  - PDF4QT editor main window
  - native rendering
  - native text selection and hit testing
  - standard PDF annotations
  - forms and signatures
  - PDF4QT undo/redo
  - explicit save/apply output
  - Agent panel dock
  - WebView-hosted React/ACP panel
  - PdfOperationBridge host API
  - tool-call and permission UI
```

## Boundary

PDF4QT owns the PDF surface. React must not draw a second PDF view, maintain a
parallel page coordinate model, or write PDF files directly.

React can request preview, clear preview, apply, undo, and redo operations
through `PdfOperationBridge`. The existing Electron app is a prototype migration
aid and should not be treated as the final PDF surface. The PNG page-image path
is acceptable only as a diagnostic or temporary fallback; it is not the product
architecture.

## Native Shell Slice

The first native shell slice is:

1. Build `inkwell-native-shell`.
2. Use PDF4QT `PDFEditorMainWindow` as the main PDF viewer/editor.
3. Add a right-side agent dock.
4. Compile the dock with Qt WebEngine when installed.
5. Open an initial PDF path from the command line.
6. Keep PDF operations in the PDF4QT window operation stack.

The staged Qt WebView loads the bundled React panel from
`Contents/Resources/agent-panel/index.html?surface=native-panel` on macOS,
or the adjacent `agent-panel/index.html?surface=native-panel` directory on
non-macOS staging layouts. `INKWELL_AGENT_PANEL_URL` remains an explicit
development/diagnostic override, and the build-tree app can fall back to
`http://127.0.0.1:5173/?surface=native-panel` when no bundle exists. In
surface mode, React renders only side-panel controls and `ChatPanel`; it does
not render `PdfViewer` or a second document surface. It reads the current PDF
document from `PdfOperationBridge.getCurrentDocumentJson()`.

## Bridge Slice

The native shell owns the first `PdfOperationBridge` object. It is a Qt
`QObject` registered into the optional WebView as `pdfOperationBridge` through
Qt WebChannel.

Current-document discovery comes from the live PDF4QT `PDFProgramController`
and `PDFDocument` catalog: path, title, and page count come from the native PDF
surface, not a React/PDF.js shadow model.

`previewOperationsJson()` supports `highlight`, `underline`, and `strikeout`
text markup operations and `freeText`, `stamp`, and `shape` standard
annotation operations by creating PDF4QT annotations through
`PDFDocumentModifier` and `PDFDocumentBuilder`, then handing the modified
document back through `PDFProgramController::onDocumentModified()` so the normal
PDF4QT document undo/redo path is used. Text markup operations can provide
existing quadrilateral rects or a text `query`; query matching runs inside
PDF4QT with `PDFTextLayoutGenerator` and `PDFTextFlow::find`, so React does not
maintain a parallel text-search or coordinate model.

`clearPreviewJson()` removes tracked preview annotations by batch, or clears all
active preview batches when no batch id is provided. It uses
`PDFDocumentBuilder::removeAnnotation()` instead of generic undo, so clearing a
preview does not roll back unrelated later edits.

`undoJson()` and `redoJson()` call PDF4QT's live `PDFUndoRedoManager`.
`applyOperationsJson()` writes the current native document to a sibling
`*_applied.pdf` output with `PDFDocumentWriter` and never overwrites the opened
source PDF.
