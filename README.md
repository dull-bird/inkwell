# Inkwell

A modern, cross-platform PDF reader and editor with an AI agent side panel.

## Features (target)

- Open and render PDFs
- Manual highlight / annotation tools
- Chat with an agent (Claude Code, Codex CLI, etc.) via ACP
- Agent-driven operations: highlight, summarize, merge, split, watermark, encrypt
- Undoable edit layer before applying changes to the PDF
- Single execution layer: all PDF writes go through Python + PyMuPDF

## Tech stack

- **Frontend**: React 18 + TypeScript + Vite
- **Desktop shell**: Electron
- **PDF engine**: PyMuPDF (Python)
- **Backend API**: FastAPI
- **Agent protocol**: ACP via `@mcpc-tech/acp-ai-provider`

## Quick start

```bash
# Install Node dependencies
npm install

# Install Python backend (one-time setup)
npm run backend:install

# Start everything: Vite dev server + Electron window + Python backend
npm run dev
```

`npm run dev` is the only thing you run day-to-day. Electron's main process
(`electron/main.ts`) spawns the Python backend itself as soon as the app
window opens, so there's no separate backend process to start or keep
running — one command, one window.

`npm run backend:dev` exists only if you want to run the FastAPI backend
standalone (e.g. to hit its HTTP API directly without the desktop app).

## Project structure

```
inkwell/
├── electron/          # Electron main process & preload
├── src/               # React frontend
│   ├── components/    # PdfViewer, ChatPanel
│   ├── hooks/         # shared hooks
│   └── types/         # shared TypeScript types
├── backend/           # Python execution layer
│   └── inkwell/
│       ├── pdf_engine.py
│       └── server.py
├── shared/            # protocol/types shared across layers
└── CLAUDE.md          # project-level agent instructions
```

## License

MIT
