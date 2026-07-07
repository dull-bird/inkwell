# ACP UI Spike

Date: 2026-07-08

## Goal

Evaluate whether ACP UI can be reused as Inkwell's agent/chat panel rather than
continuing to hand-roll ACP handling inside the current Electron prototype.

## Source

Repository:

```text
https://github.com/formulahendry/acp-ui
```

Local clone:

```text
/tmp/acp-ui-spike
```

Version observed:

```text
package.json version 0.1.16
```

License:

```text
MIT
```

## Verification

Commands run:

```bash
cd /tmp/acp-ui-spike
npm install
npm run build:web
```

Result:

```text
build:web passed
```

`npm install` reported 8 audit findings in the cloned spike. This is acceptable
for research but is one reason to fork/cull dependencies rather than embedding
the entire app blindly.

## Architecture Observed

Important files:

```text
src/lib/acp-bridge.ts
src/lib/transport/types.ts
src/lib/transport/stdio.ts
src/lib/transport/websocket.ts
src/lib/host/index.ts
src/stores/session.ts
src/stores/config.ts
src/stores/traffic.ts
src/components/ChatView.vue
src/components/ToolCallCard.vue
src/components/PermissionDialog.vue
src/components/TrafficMonitor.vue
```

Key observations:

- ACP UI uses `@agentclientprotocol/sdk` directly.
- `AcpClientBridge` adapts JSON-RPC transport to the ACP client interface.
- Transports are separated from ACP logic through `AcpTransport`.
- Tauri host operations are isolated behind `src/lib/host`.
- Session state is centralized in Pinia `useSessionStore`.
- Chat UI consumes normalized session messages rather than raw JSON-RPC.
- Permission requests are modeled explicitly through `session/request_permission`.
- The traffic monitor records incoming/outgoing JSON-RPC messages for debugging.

## Reuse Assessment

High-value reuse:

- ACP bridge and transport abstraction
- session lifecycle
- prompt/cancel flow
- permission UI
- tool call cards
- traffic monitor
- default agent configs

Needs Inkwell-specific adaptation:

- host abstraction should target Qt WebView instead of Tauri
- tool results need a PDF operation bridge
- current document context must come from the PDF4QT host
- PDF operations must preview before saving
- permission prompts should distinguish preview/apply/write actions

Not worth reusing:

- top-level Tauri app shell
- mobile packaging
- telemetry
- generic file-management assumptions as the primary workspace model

## Recommended Direction

Fork ACP UI for the right-side agent panel. Keep PDF rendering/editing in
PDF4QT. Connect both sides through a narrow `PdfOperationBridge`.

This gives Inkwell a mature ACP/chat baseline without giving up control of the
PDF product experience.
