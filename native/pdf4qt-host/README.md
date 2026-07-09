# Inkwell PDF4QT Host

This directory contains the native host process that will become Sparrow's
PDF4QT-backed renderer and edit core.

Current state:

- Transport is implemented as newline-delimited JSON over stdio.
- The binary name is `inkwell-pdf4qt-host`.
- The executable accepts `--stdio-json`.
- The linked PDF4QT command slice supports `host_status`, `open_document`,
  `document_info`, `find_text`, `preview_highlights`, `export_pages_as_images`,
  and `export_text`.
- Remaining edit commands are intentionally reported as not implemented until
  their PDF4QT operations are wired.

Build:

```bash
npm run native:doctor
npm run native:configure
npm run native:build
npm run native:stage
```

`npm run native:configure` auto-discovers the local Qt and Blend2D prefixes used
by this repository and links the vendored PDF4QT core when the submodule is
present. If you need to override the defaults manually, configure with:

```bash
CMAKE_PREFIX_PATH="$HOME/.local/Qt/6.6.3/gcc_64;$HOME/.local/inkwell-native" \
CC=/usr/bin/gcc-10 CXX=/usr/bin/g++-10 \
cmake -S native/pdf4qt-host -B native/build/pdf4qt-host \
  -DINKWELL_USE_BUNDLED_PDF4QT=ON -DCMAKE_BUILD_TYPE=Release
cmake --build native/build/pdf4qt-host --parallel 2
```

The staging script copies the binary to:

```text
native/dist/<platform>-<arch>/inkwell-pdf4qt-host
```

Electron Builder packages `native/dist` into app resources, where Electron
resolves the host before falling back to `INKWELL_PDF4QT_HOST`.
