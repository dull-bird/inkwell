# Native Core And Packaging Roadmap

Sparrow's current runtime is still:

- renderer: `pdf.js` through `react-pdf`;
- PDF write engine: Python backend with PyMuPDF;
- native PDF4QT core: discovered through `INKWELL_PDF4QT_HOST` when present.

The product UI now reports this explicitly through the Native Core status panel.
This keeps the app honest while the PDF4QT migration is underway.

## PDF4QT Bridge

The next native milestone is a small `inkwell-pdf4qt-host` executable that
speaks a narrow JSON command protocol:

- `open_document`
- `document_info`
- `find_text`
- `preview_highlights`
- `apply_operations`
- `undo`
- `redo`
- `save_as`

The canonical command list is tracked in
`shared/native-pdf-commands.ts`. Keep the JSON protocol small: renderer UI,
ACP tools, and the native host should all agree on these commands before adding
specialized tools such as form fill, redaction, or signatures.

Manual tools and agent tools should both call that bridge so the undo stack,
annotation model, and saved output behavior stay identical.

## Cross-Platform Packaging

Electron Builder is configured with first-pass targets:

- macOS: `dmg`, `zip`
- Windows: `nsis`
- Linux: `AppImage`, `deb`

This is not yet a final distributable app because the Python backend still runs
as a development process and PDF4QT is not bundled. Production packaging needs:

1. Bundle or replace the Python backend.
2. Bundle `inkwell-pdf4qt-host` under Electron resources.
3. Probe the bundled host before falling back to `INKWELL_PDF4QT_HOST`.
4. Sign and notarize macOS builds.
5. Sign Windows installers.
6. Add CI matrix builds for macOS, Windows, and Linux.
