# Inkwell Project Context

Inkwell is a cross-platform PDF reader and editor with an AI agent side panel.
The user can open a PDF, read it, manually annotate it, and chat with an agent
(Claude Code, Codex CLI, etc. via ACP) to perform operations like highlighting,
summarizing, merging, splitting, watermarking, and encryption.

## Architecture

- **Frontend**: React + TypeScript, rendered inside Electron.
- **Desktop shell**: Electron main process spawns the Python backend and exposes
  safe APIs via a preload script.
- **PDF execution layer**: Python + FastAPI + PyMuPDF. All PDF writes go through
  this single layer to avoid conflicts.
- **Agent integration**: `@mcpc-tech/acp-ai-provider` connects to ACP-compatible
  agents (Claude Code, Codex CLI). The agent runs shell commands / Python scripts
  against the same backend API.
- **Edit model**: The frontend maintains an undoable operation layer. Edits are
  not written to the original PDF until the user explicitly applies them. This
  keeps manual edits and agent edits consistent and reversible.

## Key constraints

1. All file modifications must go through `backend/inkwell/pdf_engine.py`.
2. Do not write directly to the opened PDF path; always write to a sibling
   `_applied`, `_watermarked`, `_encrypted`, etc. output file or a temp file.
3. The backend is stateless. The frontend owns the operation stack and the
   current file path.
4. Prefer standard PDF annotations so files remain compatible with other readers.
5. Keep the UI and agent layer thin; the heavy PDF work lives in Python.

## Commands

- `npm run backend:install` — install the Python backend in editable mode (one-time setup).
- `npm run dev` — start everything: Vite dev server, Electron window, and the
  Python backend (auto-spawned by `electron/main.ts`). This is the only
  command needed day-to-day; there's no separate backend process to launch.
- `npm run backend:dev` — run the Python backend standalone, without
  Electron (useful for hitting the HTTP API directly).

## Files to know

- `electron/main.ts` — Electron entry, spawns backend.
- `electron/preload.ts` — safe bridge to renderer.
- `src/App.tsx` — root UI layout.
- `src/components/PdfViewer.tsx` — PDF rendering.
- `src/components/ChatPanel.tsx` — agent chat side panel.
- `backend/inkwell/pdf_engine.py` — stateless PDF operations (PyMuPDF).
- `backend/inkwell/server.py` — FastAPI HTTP surface.
