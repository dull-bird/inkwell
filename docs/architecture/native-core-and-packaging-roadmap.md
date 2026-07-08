# Native Core And Packaging Roadmap

Sparrow's current runtime is still:

- renderer: `pdf.js` through `react-pdf`;
- PDF write engine: Python backend with PyMuPDF;
- native PDF4QT core: discovered from a bundled
  `native/pdf4qt-host/<platform>-<arch>` executable or through
  `INKWELL_PDF4QT_HOST` during development.

The product UI reports this explicitly through the Native Core status panel.
This keeps the app honest while the PDF4QT migration is underway.

## PDF4QT Bridge

The repository includes a small `native/pdf4qt-host` Qt/C++ scaffold for an
`inkwell-pdf4qt-host` executable that speaks a narrow JSON command protocol:

- `open_document`
- `host_status`
- `document_info`
- `find_text`
- `read_form_fields`
- `fill_form`
- `typed_signature`
- `preview_highlights`
- `apply_operations`
- `undo`
- `redo`
- `save_as`

The canonical command list is tracked in `shared/native-pdf-commands.ts`. Keep
the JSON protocol small: renderer UI, ACP tools, and native host should all agree
on these commands before adding specialized tools such as redaction, certificate
signatures, or OCR repair.

Electron has a tested bridge client in `electron/nativePdfBridge.ts`. The host
process contract is:

```text
inkwell-pdf4qt-host --stdio-json
```

Each stdin/stdout line is one JSON-RPC-like object:

```json
{"jsonrpc":"2.0","id":"...","method":"document_info","params":{"path":"/file.pdf"}}
{"jsonrpc":"2.0","id":"...","result":{"page_count":3}}
```

The renderer can reach this through the internal `nativePdf:command` IPC once a
valid bundled host exists or a valid host path is configured through
`INKWELL_PDF4QT_HOST`. Until then, all runtime behavior falls back to pdf.js and
the PyMuPDF backend.

Current host scaffold commands:

```bash
npm run native:configure
npm run native:build
npm run native:stage
```

This builds a Qt Core stdio JSON host and stages it under
`native/dist/<platform>-<arch>/`. The scaffold intentionally returns a JSON-RPC
error for PDF commands until the real PDF4QT adapter is linked.

Manual tools and agent tools should both call the bridge so the undo stack,
annotation model, and saved output behavior stay identical.

## Cross-Platform Packaging

Electron Builder is configured with first-pass targets:

- macOS: `dmg`, `zip`
- Windows: `nsis`
- Linux: `AppImage`, `deb`

Runtime bundling now has two layers:

- `backend/dist/<platform>-<arch>/inkwell-backend` for a PyInstaller backend executable.
- `native/dist/<platform>-<arch>/inkwell-pdf4qt-host` for the native PDF host.

Electron prefers the bundled backend executable when present, falls back to the
packaged Python backend source through `process.resourcesPath`, and still allows
`INKWELL_BACKEND_EXECUTABLE` or `INKWELL_PYTHON` overrides for diagnostics.
Use `npm run bundle:runtimes` before `npm run package:mac:full`,
`package:win:full`, or `package:linux:full` when producing release candidates.

This is still not a final distributable app because PDF4QT is not linked into the
native host yet, and the backend executable still depends on PyInstaller bundle
quality on each platform.

Production packaging still needs:

1. Link the real PDF4QT adapter into `inkwell-pdf4qt-host`.
2. Verify PyInstaller backend bundles on macOS, Windows, and Linux.
3. Sign and notarize macOS builds.
4. Sign Windows installers.
5. Add CI matrix builds for macOS, Windows, and Linux.
