# Native Core And Packaging Roadmap

Inkwell's target runtime is:

- PDF surface: Qt/PDF4QT native shell.
- Agent and workflow UI: WebView-hosted React/ACP panel inside the Qt shell.
- PDF writes: explicit PDF4QT operations, or the Python PyMuPDF backend only
  while a native operation is not yet implemented.
- Native executables: staged under `native/dist/<platform>-<arch>/`.

The Electron app remains useful as a prototype migration aid, but it is not the
final PDF viewing surface.

## PDF4QT Command Host

`native/pdf4qt-host` is a stdio JSON command host:

```text
inkwell-pdf4qt-host --stdio-json
```

It keeps the command protocol explicit and testable. The command list is
tracked in `shared/native-pdf-commands.ts`. The linked PDF4QT slice currently
implements:

- `host_status`
- `open_document`
- `document_info`
- `find_text`
- `preview_highlights`
- `export_pages_as_images`
- `export_text`

Remaining edit commands should be implemented in PDF4QT and share the same
operation model as manual edits.

## Native Qt Shell

`native/inkwell-shell` is the target desktop shell. It should:

- use PDF4QT `PDFEditorMainWindow` as the primary PDF viewer/editor;
- add the agent dock on the right side of the same Qt window;
- embed the React/ACP panel with Qt WebEngine when the dependency is available;
- expose a strict `PdfOperationBridge` WebView panel;
- keep preview, apply, undo, redo, and save behavior in the PDF4QT operation
  stack.

Build commands:

```bash
npm run build:renderer
npm run native:shell:configure
npm run native:shell:build
npm run native:shell:stage
```

Use `npm run native:shell:configure -- --webview` after Qt WebEngine is
installed to compile the agent panel as a real WebView.

## Packaging

Runtime bundling has three layers:

- `backend/dist/<platform>-<arch>/inkwell-backend` for the Python backend.
- `native/dist/<platform>-<arch>/inkwell-pdf4qt-host` for the command host.
- `native/dist/<platform>-<arch>/inkwell-native-shell` or
  `inkwell-native-shell.app` for the final Qt product shell.
- The staged Qt shell copies the renderer bundle from `dist` to
  `agent-panel/` next to the native executable, or to
  `Contents/Resources/agent-panel/` inside the macOS app bundle. The native
  WebView loads that local panel by default; `INKWELL_AGENT_PANEL_URL` is an
  explicit development/diagnostic override.

## Near-Term Work

1. Fix local native dependencies for PDF4QT GUI builds, especially `blend2d`.
2. Extend `PdfOperationBridge` from text markup and standard annotation
   preview/clear/apply/undo/redo to the remaining PDF edit operations.
3. Productize the native `agentHostBridge` beyond its current unavailable
   stub so Qt owns real ACP/agent session lifecycle instead of only exposing
   the WebChannel boundary.
4. Route every agent PDF tool result through the bridge instead of rendering
   JSON only.
5. Move the remaining manual edit tools onto the same native operation path.
