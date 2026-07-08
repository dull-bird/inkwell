# PDFGear Parity TODO

OCR is intentionally deferred. It remains a future track, not part of the
current completion slice:

- Future OCR: scanned-PDF OCR, area OCR, searchable PDF output, language
  selection, and OCR-backed Office conversion.

Current non-OCR parity tracks:

## 1. PDF4QT Native Core

- Done: link the real PDF4QT core adapter into `inkwell-pdf4qt-host`.
- Done: implement PDF4QT-backed `open_document`, `document_info`, `host_status`,
  `find_text`, `preview_highlights`, and `export_text` command handling in the
  native host.
- Implement every command in `shared/native-pdf-commands.ts` in the native host,
  not only the current read-only subset.
- Route manual tools and Agent tools through the same native command path once
  the host is complete.

## 2. Format Conversion

- Done: image-to-PDF creation through UI, backend, Agent tools, and tests.
- Done: initial local Markdown/HTML to PDF conversion through UI, backend,
  Agent tools, and tests.
- Upgrade Markdown/HTML to PDF export to Chromium-quality rendering.
- Add Office conversion adapters for Word, Excel, and PowerPoint where local
  platform support exists.

## 3. Direct Content Editing

- Done: insert local images as visible PDF page content through UI, backend,
  Agent tools, and tests.
- Edit existing text objects rather than only adding overlays.
- Add image replace, resize, and delete operations.
- Add link detection and link editing.

## 4. Page Organization

- Done: delete pages, extract pages, insert blank pages, rotate pages, crop pages,
  and page resize through UI, backend, Agent tools, and tests.
- Add thumbnail drag reorder and selected-page batch actions.
- Done: outline/bookmark read and edit through UI, backend, Agent tools, and tests.
- Done: attachment read, extract, add, and remove through UI, backend, Agent
  tools, and tests.

## 5. Signing And Forms

- Done: typed signature and image signature through UI, backend, Agent tools,
  and tests.
- Add drawn signature.
- Add certificate-based digital signatures and signature fields.
- Add form field creation/editing for text, checkbox, radio, list, and dropdown.

## 6. AI Agent Productization

- Prefer one-step tools for user-visible PDF edits, then open the resulting PDF.
- Keep preview-only tools available for explicit preview workflows.
- Add tool-call confirmation for destructive or batch operations.
- Add multi-document comparison and batch task progress.
- Add failure recovery guidance when a backend or native command fails.

## 7. Production Packaging

- Verify PyInstaller backend bundles on macOS, Windows, and Linux.
- Stage and verify native host bundles on all target platforms.
- Add CI matrix builds.
- Add macOS signing/notarization and Windows signing.
