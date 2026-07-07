# PDF4QT Spike: Native PDF Core Validation

Date: 2026-07-08

## Summary

PDF4QT is the strongest candidate for Inkwell's native PDF core. A macOS build
was completed from source with small local patches, unit tests passed, and a
temporary C++ smoke test proved that PDF4QT can create standard highlight
annotations from detected heading text and save a new PDF.

This does not mean Inkwell should simply ship PDF4QT as-is. The useful path is
to fork or submodule PDF4QT, keep the PDF engine native, and build Inkwell's ACP
tool layer and focused UX around it.

## What Was Built

Spike source:

```text
/tmp/pdf4qt-spike
```

Dependency prefix:

```text
/tmp/pdf4qt-deps
```

Build command:

```bash
cmake -S /tmp/pdf4qt-spike -B /tmp/pdf4qt-spike/build-full-macos \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_PREFIX_PATH=/tmp/pdf4qt-deps

cmake --build /tmp/pdf4qt-spike/build-full-macos --config Release -j8
```

Built outputs included:

```text
/tmp/pdf4qt-spike/build-full-macos/bin/Pdf4QtEditor.app
/tmp/pdf4qt-spike/build-full-macos/bin/Pdf4QtViewer.app
/tmp/pdf4qt-spike/build-full-macos/bin/PdfTool
/tmp/pdf4qt-spike/build-full-macos/bin/libPdf4QtLibCore.dylib
```

The full `bin` output was about 22 MB, excluding Homebrew Qt dependencies.

## Local macOS Patches Used

The spike required small local patches:

- Guard `qt_add_translations(...)` when building only the core library.
- Replace `std::execution::seq/par` usage with ordinary STL calls for libc++.
- Link `fontconfig` explicitly in `Pdf4QtLibCore`.
- Add macOS app bundle install destinations for the PDF4QT apps.

These are good candidates for an upstreamable macOS support patch set.

## Verification

Unit tests:

```bash
/tmp/pdf4qt-spike/build-full-macos/bin/UnitTests
/tmp/pdf4qt-spike/build-full-macos/bin/UnitTestsImageOptimizer
```

Result:

```text
18 passed, 0 failed
UnitTestsImageOptimizer passed
```

PDFTool capabilities:

```bash
/tmp/pdf4qt-spike/build-full-macos/bin/PdfTool list
```

Confirmed command coverage:

- attachments
- decrypt/encrypt
- diff
- fetch-images
- fetch-text
- info and metadata commands
- optimize
- redact
- render
- separate
- statistics
- unite
- verify-signatures
- xml export

## Highlight Smoke Test

A temporary sample PDF was created at:

```text
/tmp/inkwell_pdf4qt_sample.pdf
```

It contained three heading-like blocks:

- Introduction
- Method
- Results

A temporary C++ smoke test was added under `/tmp/pdf4qt-spike/PdfTool` to:

1. Read the PDF with `PDFDocumentReader`.
2. Build text flow with `PDFDocumentTextFlowFactory`.
3. Treat large text blocks as headings.
4. Create highlight annotations with `PDFDocumentBuilder::createAnnotationHighlight`.
5. Save a new PDF with `PDFDocumentWriter`.

Output:

```text
/tmp/inkwell_pdf4qt_sample_highlighted.pdf
```

The smoke test reported:

```text
highlighted 1 "Introduction"
highlighted 1 "Method"
highlighted 1 "Results"
highlight_count 3
```

PyMuPDF verified that the output contains three standard PDF Highlight
annotations with valid rectangles, vertices, opacity, and yellow stroke color.
PyMuPDF rendered those annotations visibly.

## Important Finding: PdfTool Render Target

During verification, `PdfTool render` initially appeared not to show the
highlights. Root cause: PDF4QT's batch render path constructs
`PDFAnnotationManager` with `Target::Print`. PDF annotations without the PDF
`Print` flag are correctly skipped for print output.

When the same annotations were marked printable, `PdfTool render` displayed the
highlights. This means the generated annotations were valid; the CLI render path
was using print semantics.

For Inkwell:

- The interactive viewer should render with view semantics.
- Batch export/print should intentionally choose whether annotations are
  printable.
- Tests should cover both screen-view and print/export rendering.

## Relevant PDF4QT APIs

Undo/redo:

```text
Pdf4QtLibGui/pdfundoredomanager.h
Pdf4QtLibGui/pdfundoredomanager.cpp
```

Key methods and signals:

- `PDFUndoRedoManager::createUndo(...)`
- `PDFUndoRedoManager::doUndo()`
- `PDFUndoRedoManager::doRedo()`
- `PDFUndoRedoManager::documentChangeRequest(...)`

Document modifications:

```text
Pdf4QtLibCore/sources/pdfdocument.h
Pdf4QtLibCore/sources/pdfdocumentbuilder.h
```

Useful modification flags:

- `PDFModifiedDocument::Annotation`
- `PDFModifiedDocument::PageContents`
- `PDFModifiedDocument::FormField`
- `PDFModifiedDocument::PreserveUndoRedo`
- `PDFModifiedDocument::PreserveView`

Highlight creation:

```text
Pdf4QtLibWidgets/sources/pdfadvancedtools.cpp
Pdf4QtLibCore/sources/pdfdocumentbuilder.h
Pdf4QtLibCore/sources/pdfdocumentbuilder.cpp
```

PDF4QT's own highlight tool converts text selection to quadrilaterals, creates a
standard highlight annotation, updates the appearance stream, marks annotations
changed, and emits a modified document.

## Recommendation

Proceed with a native PDF4QT-based spike.

Do not extract ONLYOFFICE PDF code. It is too coupled to the office suite and is
not aligned with Inkwell's lightweight PDF-first goal.

The next implementation target should be:

1. Add PDF4QT as a submodule or fork.
2. Create an `inkwell_native` Qt app shell.
3. Open and render a PDF.
4. Expose `highlight_headings` through an internal native command.
5. Route both manual and command-driven annotations through the same undo/redo
   stack.
6. Add an ACP bridge that calls the native command and returns structured
   results.
7. Save only to explicit output paths, never directly mutating the source PDF.

## Risks

- macOS support needs ongoing maintenance.
- PDF heading detection should not rely only on font size; it needs a layered
  heuristic using outline entries, tagged structure, font metrics, text block
  geometry, and user confirmation for ambiguous documents.
- PDF4QT internals should be wrapped behind stable Inkwell commands so the ACP
  surface remains small and durable.
