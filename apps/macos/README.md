# OpenCast native macOS host

Swift Package Manager executable, macOS 14+, Swift 5 language mode, system frameworks
only. The host owns AppKit windows and macOS services; Node owns application data and
extension execution. Both stdio and WKWebView calls use `Bridge/NativeRouter.swift`.

## Structure

- `Sources/OpenCast/App`: accessory application, instance lock, URL delivery,
  application menus and launcher status item.
- `Backend`: supervised Node process, NDJSON requests/responses and native events.
- `Bridge` and `Web`: shared router, document-start config/listeners, trusted-origin
  bridge, asset/icon/file schemes, appearance updates and page reloads.
- `Windows`: nonactivating launcher and autosaved AI Chat, Notes, Settings windows.
- `Services`: hotkeys, applications/FSEvents, clipboard, input/snippets, AX windows
  and menus, system actions, permissions, Keychain, EventKit, files, capture, speech,
  login items, extension status items.
- `Overlays`: HUD, confetti, native alerts.
- `OpenCastCore` / `OpenCastSelfTest`: pure window geometry and virtual key mappings.
- `Resources`: bundle metadata and generated icon. `DevStub`: independent IPC/page
  fixture and repeatable read-only smoke test.

## Build and run

From the repository root:

```sh
swift build -c release --package-path apps/macos
./scripts/build-app.sh
codesign -v build/OpenCast.app
swift run -c release --package-path apps/macos OpenCastSelfTest
```

`./scripts/build-app.sh` requires pnpm and builds all three web packages. Any package
build failure stops assembly. Frontend pages, backend, and extension runtime outputs
must exist before signing. `--skip-web` skips the web build and reuses those required
outputs; it does not omit them. The script stages and signs before replacing
`build/OpenCast.app`. It includes the root license and full third-party notices in
`Contents/Resources/licenses/`; missing dependency license text stops assembly.

Flags: `--debug`, `--bundle-node`, `--skip-web`, `--open`. Node must be 22.13 or newer.
Without bundled Node, the host resolves Node from the user's login-shell PATH, then
Homebrew's usual paths. `--bundle-node` uses the checksum-pinned standalone Node from
`scripts/prepare-release-node.sh`, including the full license from that archive.
`OPENCAST_NODE` can select a runtime prepared by that script, with its adjacent
license and provenance file intact. Release DMGs support Apple silicon only.
The current signature is ad hoc and is not notarized. Developer ID signing and
notarization require an Apple Developer certificate and are not set up yet.

`./scripts/make-icon.sh` regenerates `Resources/AppIcon.icns` from `assets/icon.svg`
using the pinned SVG renderer, sips and iconutil (requires pnpm).

Run the complete app with `open build/OpenCast.app`, or invoke its executable directly
when setting environment overrides. Option-Space toggles the launcher. The status
menu opens AI Chat, Notes and Settings. Standard Edit shortcuts work in the web views.
Notes can be pinned via `window.setFloating`. The app stays running when windows close.
Launching another instance asks the existing process to show the launcher and exits.

## Development stub

After `--skip-web` assembly:

```sh
python3 apps/macos/DevStub/smoke-test.py
python3 apps/macos/DevStub/smoke-test.py --restart
```

Each test creates temporary frontend resources under `.build/dev-resources`, launches
for approximately 15 seconds, verifies native results and web bridge reports, tests
single-instance handling, and terminates the host and its backend. `--restart` kills
only the spawned stub backend once and checks that the restarted frontend reports
again. Tests do not ask for permissions, post keyboard events, read clipboard contents,
or run system actions. Test data and logs stay under `.build/dev-resources`, so
the tests can run while an installed app uses the normal data directory.

For interactive use:

```sh
mkdir -p apps/macos/.build/manual-resources/frontend
cp apps/macos/DevStub/main.html apps/macos/.build/manual-resources/frontend/main.html
OPENCAST_BACKEND_ENTRY="$PWD/apps/macos/DevStub/stub-backend.mjs" \
OPENCAST_RESOURCES="$PWD/apps/macos/.build/manual-resources" \
OPENCAST_SHOW_ON_START=1 \
build/OpenCast.app/Contents/MacOS/OpenCast
```

The page includes search, height controls, Hide, HUD, Confetti and Applications buttons.
The stub implements only native health checks and a minimal authenticated WebSocket
report channel; it is not a substitute for the actual backend.

## Debugging and environment

WKWebViews have `isInspectable = true`. Enable Safari's developer features, then use
Safari's **Develop → this Mac → OpenCast** menu to inspect each page. Inspect
`window.__OPENCAST__` for its window kind, backend URL and per-process token (do not
share the token). Listen with `window.__opencastNative.on(topic, handler)`; it returns
an unsubscribe function. Call native with
`webkit.messageHandlers.native.postMessage({ method, params })`, which resolves to
`{ result }` or `{ error: { code, message, data? } }`.

| Variable | Purpose |
| --- | --- |
| `OPENCAST_NODE` | First Node executable candidate |
| `OPENCAST_BACKEND_ENTRY` | Absolute or cwd-relative backend `index.mjs` override |
| `OPENCAST_RESOURCES` | Resources root containing `frontend/`, optionally backend/runtime/Node |
| `OPENCAST_DATA_DIR` | Isolated application data directory for development or tests |
| `OPENCAST_LOG_DIR` | Native/backend log directory override |
| `OPENCAST_EPHEMERAL_WEB_STORAGE=1` | Keep test WebKit storage in memory, separate from installed app preferences |
| `OPENCAST_DEV_URL` | Vite base URL, e.g. `http://localhost:5173` |
| `OPENCAST_KEEP_OPEN=1` | Keep launcher visible after losing key status |
| `OPENCAST_SHOW_ON_START=1` | Show launcher immediately for development |

Native bridge access is limited to the main frame on `surgecast-app://app` (the stable
private storage origin), `opencast-app://app`, or the exact
configured development origin. External links open in the default browser. Asset
paths are canonicalized to prevent traversal and symlink escapes. Configuration is
injected only after `backend.ready`; every restart replaces the token/port scripts and
reloads all existing pages. Stdio stdout is reserved for JSON-RPC. Backend failures
restart after 1, 2, 4, 8, 16, then 30 seconds; requests have a timeout and are rejected
on disconnect. A periodic `backend.ping` checks responsiveness.

## Permissions and data

The app is not sandboxed. Permissions are requested only by explicit native calls.

- Accessibility: synthetic typing/pasting, selected text, snippet expansion, AX
  window/menu commands and Notification Center dismissal.
- Input Monitoring: listen-only snippet event tap where required by macOS.
- Screen Recording: screenshot capture.
- Calendar full access: reading calendars, events and conference links.
- Automation: Finder selections and requested AppleScript/system actions; grants
  are specific to each receiving app.
- Contacts, Reminders, Location, Microphone: explicit extension permission requests.
- Full Disk Access and folder grants: protected file access selected by the user;
  there is no general public Full Disk Access status query.
- Notifications: requested when delivering a notification. Login items use
  `SMAppService.mainApp`, and may need confirmation in System Settings.

Missing required permissions produce `-32002` with `{ permission }`. See
`PROTOCOL_NOTES.md` for unsupported OS operations and proposed type clarifications.

Data lives under `~/Library/Application Support/OpenCast`; clipboard images are
content-addressed PNGs under `clipboard/`, Finder icon cache under `icon-cache/`.
Keychain generic passwords use service `app.opencast`. Clipboard events include
privacy markers and source app; ignored bundle IDs produce no events. Temporary
clipboard restoration only runs if a newer copy has not replaced the inserted content.

Existing installs reuse legacy SurgeCast data and log directories and read legacy
Keychain services. New installs and writes use the OpenCast names.
