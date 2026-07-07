# ADR 0002: Fork ACP UI for the Agent Panel

Date: 2026-07-08

## Status

Accepted for spike.

## Context

Inkwell needs a chat panel because the user should be able to say things like
"highlight every heading" or "summarize this page" and see PDF edits previewed
in the current document. The PDF layer should be PDF4QT, but PDF4QT does not
provide an ACP client, agent thread UI, tool-call visualization, permission
prompts, or agent configuration.

The current Electron prototype hand-rolls too much ACP behavior:

- agent process configuration
- chat message streaming
- tool call/result rendering
- permission and tool-result routing
- operation preview handoff into the PDF viewer

That is already fragile. Button-triggered PDF operations work because they call
the backend directly, but the ACP path can fail to update the viewer when tool
results are not routed exactly right.

ACP UI was evaluated as a candidate base:

- Repository: https://github.com/formulahendry/acp-ui
- License: MIT
- Stack: Vue, Pinia, Tauri, `@agentclientprotocol/sdk`
- Local spike path: `/tmp/acp-ui-spike`
- Verification: `npm install` and `npm run build:web` both passed

ACP UI already includes multi-agent configuration, session management, rich chat
rendering, tool-call visualization, permission prompts, traffic monitoring, and
default agent presets for Claude Code, Codex, Gemini, Qwen, OpenCode, and
others.

## Decision

Fork ACP UI as the basis for Inkwell's agent panel, but do not adopt ACP UI as
the whole application shell.

Inkwell's product shell should be native Qt/PDF4QT. The agent panel should be a
WebView hosted inside that shell, derived from ACP UI and modified for PDF
operations.

## Architecture

```text
Inkwell Qt App
  ├─ PDF4QT Viewer/Editor
  │    ├─ native rendering
  │    ├─ standard annotations
  │    ├─ undo/redo
  │    └─ save/apply output
  ├─ PdfOperationBridge
  │    ├─ preview operations
  │    ├─ apply operations
  │    ├─ undo/redo
  │    └─ current document context
  └─ Agent Panel WebView
       └─ forked ACP UI
            ├─ ACP SDK runtime
            ├─ agent config
            ├─ sessions
            ├─ chat UI
            ├─ tool cards
            ├─ permission prompts
            └─ traffic monitor
```

## Reuse From ACP UI

Reuse or port these pieces:

- `src/lib/acp-bridge.ts`
- `src/lib/transport/*`
- `src/stores/session.ts`
- `src/stores/config.ts`
- `src/stores/traffic.ts`
- `src/components/ChatView.vue`
- `src/components/ToolCallCard.vue`
- `src/components/PermissionDialog.vue`
- `src/components/AgentSelector.vue`
- `src/components/SessionList.vue`
- `src/components/TrafficMonitor.vue`
- agent configuration defaults and presets

## Remove Or De-emphasize

Remove or postpone these parts for Inkwell:

- ACP UI as the top-level Tauri app shell
- mobile support
- generic file management as the primary workspace model
- generic browser-only WebSocket workflows
- telemetry
- unrelated app settings not needed for PDF work

## Required Inkwell Modifications

The forked agent panel must understand PDF operations as first-class UI events.
Tool results should not only render JSON in chat. They must be able to ask the
host PDF layer to preview, apply, undo, redo, or save operations.

The key addition is a host bridge:

```ts
export interface PdfOperationBridge {
  getCurrentDocument(): Promise<CurrentPdfDocument | null>;
  previewOperations(batch: PdfOperationBatch): Promise<PdfOperationPreviewResult>;
  applyOperations(batchId: string): Promise<PdfApplyResult>;
  undo(): Promise<PdfUndoRedoState>;
  redo(): Promise<PdfUndoRedoState>;
  clearPreview(batchId?: string): Promise<void>;
}
```

The forked agent panel should call `previewOperations` when an ACP tool returns
PDF preview operations. It should call `applyOperations` only when the user
explicitly asks to write a new PDF or clicks an apply action.

## Consequences

Positive:

- Inkwell avoids maintaining a fragile custom ACP/chat runtime.
- The agent panel starts from a working implementation with sessions,
  permissions, traffic debugging, and agent presets.
- PDF-specific UX remains under Inkwell control.
- The path matches the product goal: lightweight PDF tool plus user-owned
  agents.

Negative:

- ACP UI is Vue/Tauri while the target shell is Qt/PDF4QT, so this is a fork
  and adaptation, not a drop-in component.
- The fork will need ongoing sync with upstream ACP UI and ACP SDK changes.
- The bridge boundary must be strict; otherwise the fork can grow into another
  full app inside Inkwell.

## Next Spike

1. Fork or vendor ACP UI under an isolated workspace.
2. Add a host abstraction compatible with Qt WebView.
3. Add a mock `PdfOperationBridge` in the web build.
4. Modify tool-result handling so PDF operations call the bridge instead of
   only rendering JSON.
5. Embed the web build in a minimal Qt/PDF4QT host.
6. Verify this flow:
   - open PDF
   - ask agent to highlight headings
   - agent returns preview operations
   - PDF4QT viewer displays highlights immediately
   - undo/redo works
   - apply writes a sibling PDF copy
