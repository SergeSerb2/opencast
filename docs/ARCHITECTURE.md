# OpenCast architecture

OpenCast is an open-source launcher for macOS that reproduces Raycast's behavior and
look. It mirrors the architecture of Raycast 2.x: a thin native host, a web UI, and a
Node backend.

- **AI** runs only through providers you configure: your own API keys (BYOK) or any
  OpenAI-compatible base URL (CLIProxyAPI, LiteLLM, Ollama, LM Studio, OpenRouter, ...).
- **Cloud Sync** is end-to-end encrypted and talks to a server you deploy on your own
  Cloudflare account (Workers + D1).
- **No paywalls.** Every feature that Raycast gates behind Pro (unlimited notes,
  unlimited clipboard history, custom themes, custom window commands, AI, sync, ...)
  is available.

## Processes

```
┌───────────────────────────── OpenCast.app ─────────────────────────────┐
│                                                                          │
│  Native host (Swift, AppKit)                                             │
│   - NSPanel launcher, AI Chat / Notes / Settings windows (WKWebView)     │
│   - global hotkeys, clipboard monitor, snippet expansion (CGEventTap)    │
│   - Accessibility (window management, selected text, menu items)         │
│   - EventKit, Keychain, login item, HUD, confetti, menu bar extras       │
│        │  stdio NDJSON JSON-RPC (both directions)                        │
│        ▼                                                                 │
│  Backend (Node 22+, single ESM bundle)                                   │
│   - SQLite (node:sqlite) data store, settings, search index, frecency    │
│   - AI providers + streaming, chats, AI commands, presets, MCP, tools    │
│   - extension host: one worker_thread per running extension command      │
│   - script commands, calculator, emoji, file search (mdfind)             │
│   - sync client (E2E encryption) → your Cloudflare Worker                │
│   - WebSocket JSON-RPC server on 127.0.0.1:<random port> + token         │
│        ▲                                                                 │
│        │  WebSocket JSON-RPC                                             │
│  Frontend (React 19 + Vite), one page per window:                        │
│   main.html · ai-chat.html · notes.html · settings.html                  │
│   └─ also calls native directly via webkit.messageHandlers.native        │
└──────────────────────────────────────────────────────────────────────────┘
                         │ HTTPS (E2E-encrypted blobs only)
                         ▼
             Cloudflare Worker + D1  (packages/sync-worker)
```

### Channels

All channels carry JSON-RPC 2.0 (`packages/protocol/src/jsonrpc.ts`). Either side may
send requests and notifications.

| Channel | Transport | Who calls what |
|---|---|---|
| frontend ↔ backend | `ws://127.0.0.1:<port>/rpc?token=<token>&window=<kind>` | Frontend calls `BackendMethods` (`protocol/src/rpc.ts`). Backend pushes notifications with method `"event"` and params `{ topic, payload }` (`BackendEvents`). |
| backend ↔ native | child-process stdio, one JSON object per line | Backend calls `NativeMethods` (`protocol/src/native.ts`). Native calls `BackendForNativeMethods` and sends `NativeEvents` as notifications whose method is the topic. |
| frontend → native | `window.webkit.messageHandlers.native.postMessage({ method, params })` (WKScriptMessageHandlerWithReply) | Resolves with `{ result }` or `{ error: { code, message, data } }`. Same method table as backend → native. For `window.*` methods, `kind` defaults to the calling window. |
| native → frontend | `window.__opencastNative.emit(topic, payload)` via `evaluateJavaScript` | `NativeEvents`, sent to every web view. |

The backend prints nothing but JSON-RPC to stdout. Its first message is the
notification `backend.ready` with params `{ port, token, version }`. The native host
waits for it, then injects this object into every web view at document start:

```js
window.__OPENCAST__ = {
  backendUrl: "ws://127.0.0.1:<port>/rpc",
  token: "<token>",
  window: "main" | "ai-chat" | "notes" | "settings",
  platform: "macos",
  macOSMajor: 26,
  appVersion: "0.1.0",
  dev: false
};
```

The frontend also runs in a normal browser for development (`pnpm dev`). In that case
`window.__OPENCAST__` comes from the Vite dev server, and `native` calls go to a mock
(`packages/frontend/src/bridge/native-mock.ts`) or to the backend's dev shim.

## Repository layout

```
apps/macos/                Swift package → OpenCast.app native host
packages/protocol/         Shared TypeScript contracts (no runtime code beyond helpers)
packages/backend/          Node backend (TypeScript → dist/index.mjs via esbuild)
packages/frontend/         React UI (Vite multi-page → dist/*.html)
packages/raycast-api/      Clean-room `@raycast/api` runtime for extensions (→ dist/runtime.cjs)
packages/sync-worker/      Cloudflare Worker + D1 sync server
scripts/build-app.sh       Builds everything and assembles build/OpenCast.app
scripts/dev.sh             Runs backend + Vite for browser development
docs/                      Architecture, design spec, sync protocol, extension compatibility
```

## App bundle layout

```
OpenCast.app/Contents/
  MacOS/OpenCast                     native host
  Info.plist                          LSUIElement=1, URL scheme "opencast"
  Resources/
    AppIcon.icns
    frontend/                         Vite build output (main.html, ai-chat.html, ...)
    backend/index.mjs                 backend bundle (+ workers)
    raycast-api/runtime.cjs           extension runtime (+ react, react/jsx-runtime shims)
    node/bin/node                     optional bundled Node (scripts/build-app.sh --bundle-node)
```

Node resolution order: `$OPENCAST_NODE`, `Resources/node/bin/node`, then `node` from the
user's login shell `PATH`, then `/opt/homebrew/bin/node`, `/usr/local/bin/node`.
Node 22.13 or newer is required (`node:sqlite`).

## Data locations

| What | Where |
|---|---|
| Databases, settings, extension installs | `~/Library/Application Support/OpenCast/` |
| Main database | `.../OpenCast/opencast.db` (SQLite, WAL) |
| Clipboard images | `.../OpenCast/clipboard/<sha256>.png` |
| Installed extensions | `.../OpenCast/extensions/<extension-id>/` |
| Extension support dirs | `.../OpenCast/extension-support/<extension-name>/` |
| Logs | `~/Library/Logs/OpenCast/{native,backend}.log` |
| Secrets (API keys, sync key) | macOS Keychain, service `app.opencast`, via `keychain.*` native methods |

## Web content loading

Native serves the frontend through the stable private scheme `surgecast-app://app/<page>.html`
(WKURLSchemeHandler) from `Resources/frontend`. In dev, `OPENCAST_DEV_URL`
(e.g. `http://localhost:5173`) replaces it.

Images:

- `opencast-icon://file?path=<percent-encoded path>&size=<px>` — Finder/app icon PNG.
- `opencast-file://<percent-encoded absolute path>` — a local file (extension assets,
  clipboard images). Native only serves files under the data directory, extension
  directories, `/Applications`, `/System/Applications`, and paths the backend
  allow-lists.

## Windows

| Window | Native type | Default size | Notes |
|---|---|---|---|
| main (launcher) | borderless non-activating `NSPanel`, floating level, joins all Spaces | 750 × 475 (header 64, footer 44) | Glass/vibrancy background, corner radius 26 on macOS 26, 20 on macOS 27+, 12 before. Previous app keeps focus. Top edge fixed while height changes. Hides on resign key. |
| ai-chat | titled `NSWindow`, full-size content, transparent title bar | 900 × 640, min 640 × 420 | Frame autosaved. Activates OpenCast. |
| notes | titled `NSPanel`, full-size content, transparent title bar | 420 × 520 | "Pin" toggles floating level. |
| settings | titled `NSWindow`, full-size content | 860 × 620 | Single instance. |

## Feature ownership

| Feature | Backend | Frontend | Native |
|---|---|---|---|
| Root search, aliases, favorites, frecency, fallback commands | ranking + index (`search.root`) | list UI | app list, icons |
| Calculator (math, units, currency, dates, time zones) | `calc.evaluate` (mathjs + chrono + rates cache) | inline result card | — |
| Clipboard history | storage, retention, search | views | pasteboard monitor, paste |
| Snippets | storage, placeholders | views | keyword watcher, paste |
| Quicklinks | storage, templating | views | open URL |
| Notes | storage, search | Notes window (TipTap) | window |
| Window management | — | command list | AX geometry |
| System actions | — | command list | implementation |
| File search | `mdfind` | views | icons, Quick Look |
| Emoji & symbols | dataset + search | grid | paste |
| Calendar / My Schedule | — | view | EventKit |
| Search menu items | — | view | AX menu bar |
| AI (Quick AI, Chat, Commands, Presets, tools, MCP) | providers, streaming, storage | views | selected text, screenshots |
| Extensions (Raycast-compatible) | install, worker host, store client | renderer for List/Grid/Detail/Form/Action panel | menu bar extras |
| Script commands | discovery + execution | views | — |
| Cloud Sync | E2E client | settings UI | Keychain |
| Settings | storage, defaults | Settings window | hotkey recorder, login item |

## Security notes

- The backend's WebSocket listens only on 127.0.0.1 and requires the per-launch token.
- API keys and the sync encryption key live in the Keychain, never in SQLite or logs.
- Sync payloads are encrypted on the device (AES-256-GCM, key from a passphrase via
  PBKDF2-SHA256 600k or scrypt). The Worker stores ciphertext and opaque ids only.
- Extensions run in worker threads with full Node access, the same trust model as
  Raycast. Only install extensions you trust.

Existing installs reuse legacy SurgeCast data and log directories and read legacy
Keychain services. New installs and writes use the OpenCast names.
