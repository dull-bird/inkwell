# Sparrow Shell Design

## Goal

Rename Inkwell into **雀阅 / Sparrow** and ship a usable first-stage product shell: a fast multi-PDF workspace with a right-side AI panel named **小雀 / Sparrow**, automatic document classification, suggested PDF actions, and a clean Zed-like interface. This is the foundation for reaching PDFgear-level coverage without turning the codebase into a pile of unrelated tools.

## Product Position

Sparrow is not a generic office suite. It is a lightweight PDF reader and editor for people who work with dense documents and already use their own agents through ACP.

The product should feel closer to a focused editor than a marketing-heavy PDF app:

- left workspace for folders and open PDFs
- center document tabs and PDF canvas
- right 小雀 panel for chat, suggestions, and agent actions
- compact command toolbar for PDF operations
- direct preview, undo, redo, and explicit apply/save for edits

## PDFgear Baseline

Sparrow should eventually cover the practical PDFgear feature surface:

- read PDFs, search, zoom, navigate pages
- annotations: highlight, underline, strikeout, sticky notes, free text, drawing
- text and object editing where the PDF engine supports it
- page management: merge, split, extract, delete, reorder, rotate, crop
- forms, signatures, stamps, watermarks, encryption
- OCR and conversion to/from common formats
- compression and batch tools
- AI chat with PDF contents

The differentiator is agent ownership: Sparrow should connect to the user's existing ACP agents instead of forcing a proprietary model account.

## First Stage Scope

This stage does not attempt to finish every PDFgear feature. It establishes the product shape and keeps all new code aligned with the long-term architecture.

Deliverables:

- rename visible product UI to 雀阅 / Sparrow
- draw a maintainable vector logo and 小雀 icon in the app UI
- add light and dark themes
- replace the single-document layout with a Zed-like shell:
  - left workspace rail
  - center PDF tab strip and viewer
  - right 小雀 agent panel
- support multiple opened PDFs in one session
- automatically extract and classify a newly opened document
- show suggested actions based on document class
- change agent selection from pill buttons to a dropdown
- preserve existing high-value operations: heading highlight preview, undo/redo, apply, comment, split, open output

## Document Classes

The classifier is intentionally fast and local. It should use extracted text heuristics first and avoid long agent reasoning.

Initial classes:

- `academic-paper`: abstract, references, DOI, arXiv, keywords, numbered sections
- `school-textbook`: exercises, chapter lessons, grade-level language, examples
- `university-textbook`: theorem/proof/problem-set density, formal chapter structure
- `monograph`: long-form scholarly book, chapters, bibliography, index
- `report`: executive summary, findings, recommendations, appendix
- `contract`: agreement, party, effective date, clause-heavy structure
- `slides-or-handout`: short page text, bullet-heavy, agenda-like pages
- `general`: fallback

Each class produces suggestions such as summarize, extract outline, highlight key terms, create reading plan, search related papers, split chapters, or compare with another open PDF.

## Agent Behavior

小雀 must optimize for speed:

- use local extraction and heuristics before asking an agent
- present suggested operations as clickable chips
- use ACP tools for PDF-specific actions
- show sources and links for web-backed answers
- avoid long visible reasoning
- use preview operations for visual edits and write files only when the user explicitly applies or saves

The right panel should eventually reuse the ACP UI fork, but the current Electron prototype can keep its custom React panel while the PDF operation bridge is being stabilized.

## Multi-PDF Model

The renderer owns session state:

```ts
interface SparrowDocument {
  id: string;
  path: string;
  title: string;
  status: 'analyzing' | 'ready' | 'error';
  analysis?: DocumentAnalysis;
}
```

The active tab drives the current PDF path sent to the backend and agent. Cross-document operations should use selected open documents later; first stage only exposes the structure and UI affordance.

## UI Direction

Visual direction:

- compact, editorial, Zed-like
- not one-hue purple/blue gradient
- light theme: warm white surface, ink text, teal accent, amber highlights
- dark theme: near-black surface, soft gray panels, teal accent, amber highlights
- 8px or smaller radius on panels and cards
- no decorative blobs or marketing hero layout
- tool buttons use icons/symbols where practical

Brand:

- 中文名：雀阅
- English name: Sparrow
- AI assistant: 小雀 / Sparrow
- Logo: small sparrow/book mark, simple enough to remain crisp in a 20px sidebar header

## Architecture Boundaries

- `backend/inkwell/pdf_engine.py` remains the only PDF write layer in the prototype.
- Renderer keeps undoable preview operations.
- Agent tool results should map into structured PDF operations through a small bridge module.
- UI state and document analysis should live in focused TypeScript modules, not inside `App.tsx`.
- Long-term native PDF4QT work remains valid; this shell should not make that migration harder.

## Testing

Required for this stage:

- pure tests for document classification and suggestions
- pure tests for page range parsing and agent tool result parsing
- backend tests for PDF operations
- `npm run build`

Manual checks:

- open multiple PDFs
- switch tabs without losing current document
- see document class and suggested actions
- trigger heading highlight from command or suggestion
- undo/redo preview
- split selected ranges
- verify light/dark theme toggle
