# Inkwell PDF4QT Host

This directory contains the native host process that will become Sparrow's
PDF4QT-backed renderer and edit core.

Current state:

- Transport is implemented as newline-delimited JSON over stdio.
- The binary name is `inkwell-pdf4qt-host`.
- The executable accepts `--stdio-json`.
- PDF4QT document operations are not linked yet. Until the adapter is connected,
  supported commands return a JSON-RPC error that says the PDF4QT adapter is not
  linked.

Build:

```bash
npm run native:configure
npm run native:build
npm run native:stage
```

The staging script copies the binary to:

```text
native/dist/<platform>-<arch>/inkwell-pdf4qt-host
```

Electron Builder packages `native/dist` into app resources, where Electron
resolves the host before falling back to `INKWELL_PDF4QT_HOST`.
