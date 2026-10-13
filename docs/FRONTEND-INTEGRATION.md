# Merged frontend integration audit

Audited `git diff ae97bbd..HEAD -- packages/protocol` against the owning services,
then tested the registered RPCs with real SQLite and fake native/Keychain adapters.
The four unavailable controls below are disabled in Settings with explanations.

## Contract changes

| Contract | Real implementation |
| --- | --- |
| `clipboard.update`, `clipboard.duplicate` | `backend/src/services/core/clipboard.ts`: transactional history/FTS updates, distinct duplicate identities, retained representations, shared-image cleanup, existing insert/change and deletion events. Deduplication still selects the most recent matching entry. |
| `ai.presets.reset` | `backend/src/services/ai/commands.ts`: shipped built-in definition, preserving original creation time; rejects user presets. |
| `ai.webSearch.hasApiKey`, `ai.webSearch.setApiKey` | `backend/src/services/ai/index.ts`, `SecretsService`: validated provider accounts `ai.websearch:<provider>:apiKey`, boolean-only read, empty/null deletion. Search already consumes those accounts in `ai/web.ts`. |
| `data.backup.hasPassphrase`, `data.backup.setPassphrase` | `backend/src/services/core/data.ts`, `SecretsService`: Keychain account `data.backup:passphrase`; no secret in SQLite, exports, events, results or logs. Scheduled exports require it. |
| `scripts.create` | `backend/src/services/core/scripts.ts`: TypeScript, Go and C# discovery/templates/execution; requested confirmation and refresh metadata; invalid refresh rejection. Confirmation-required inline scripts are not run unattended. Go uses `go run`; C# uses `dotnet run --file … -- …` and requires .NET 10+. Neither SDK is installed on this validation machine. |
| `snippets.render` argument options | Existing `core/placeholders.ts` already parses/returns options; covered by registered-service tests. |
| `Snippet.icon`, `Quicklink.pinned` | Entity CRUD preserves both; Raycast import now preserves them too. Frontend handles icon rendering and pinned ordering. |
| Chat title source, reasoning, instructions, source, folder and update fields | Existing `ai/chats.ts` persists/uses those fields and branching updates. `titleSource` protects user titles. Tested metadata through real RPC registration; folder settings survive backup import. |
| `AIChatFolder`, `ai.chatFolders` | Typed synced settings, existing AI Chat sidebar, and backup validation for folder records rather than string-array validation. |
| `AIAttachment.url` | `ai/attachments.ts`: bounded inline images and HTTP(S) image loading, supported MIME types, model vision checks, no URL credentials, no implicit redirects. Text is bounded to 512 KiB, inline/remote images to 10 MiB. Existing webpage attachments still use `ai/web.ts`. |
| Provider/model settings fields | Existing `ai/providers.ts`, `templates.ts`, request mapping/adapters implement Responses, secret header names/Keychain markers, fetch errors, capability overrides, system/temperature support and reasoning. Existing provider/Responses suites verify them. |
| AI command/preset reasoning, tags, highlight edits | Existing `ai/commands.ts` stores/imports/exports these fields; reasoning enters completion requests and highlighting is rendered by the frontend. |
| `commands.setPrefs.unset` | Existing `core/commands.ts` removes preferences; existing tests cover hotkey removal. |
| `clipboard.itemsChanged` | Existing deletion/clear/prune invalidation; tested with duplicate image deletion. |
| `StoreExtension.owner.avatar` | Existing store adapter forwards owner metadata unchanged. |
| `TileImage.flat` | Presentation only: existing `frontend/src/icons/TileImage.tsx` and CSS consume it; backend preserves image records. No native rendering of this frontend tile type is required. |
| `CalendarEvent.calendarTitle` | Swift `Services/Calendar.swift` supplies the calendar title. |
| Notes `window.route` forms | Existing `HostWindows` forwards route/payload unchanged; Notes accepts note IDs, `note:…`, `new`, and empty show routes. |
| `dialog.saveFile` | Swift `Services/FileDialog.swift`: NSSavePanel, type filter, atomic UTF-8 write, path/null result, sanitized write failures; `NativeRouter` dispatches it alongside openFiles. `dev-native.ts` has no openFiles CLI fallback, so no corresponding save fallback was added. |

## New settings (all 39)

Paths below are relative to `packages/` unless they name a Swift service. UI-only
controls do not need backend side effects. Host settings propagate at startup and
on local/sync changes through `backend/src/services/host-settings.ts` → `app.configure`.

| Key | Where honored |
| --- | --- |
| `keyboard.escapeKeyClosesWindow` | Frontend Settings, AI Chat and Notes keyboard handlers; Notes retains its independent lose-focus preference. |
| `keyboard.builtinHotkeysPreset` | `backend/src/services/core/hotkey-presets.ts`, `commands.ts`: window-half defaults use Ctrl+Option+Command+arrow (improved) or Ctrl+Option+arrow (original); explicit command preferences take precedence. |
| `keyboard.hyperKeyDisplayShortcut` | Frontend `components/Keycap/Keycap.tsx`, with include-shift preference. |
| `advanced.backupAutoDelete` | `backend/src/services/core/backup.ts`: keep selected count, prune only managed completed backups after successful encrypted export. |
| `advanced.backupSkipOnBattery` | Backup scheduler → Swift `Power.onBattery`; unreadable battery state fails the scheduled attempt rather than bypassing the preference. |
| `advanced.additionalCertificateAuthorities` | `backend/src/services/network.ts`: verified TLS dispatcher adds PEM roots without disabling certificate validation. |
| `advanced.windowActivationBehavior` | Swift `LauncherPanel.swift`: join active Spaces or switch to the window's Space. |
| `advanced.tidyMenuBar` | Swift `TidyMenuBar.swift`: user-positionable divider, AppKit overflow, reveal while hovering over the menu bar. Command-drag divider placement determines which items hide. |
| `ai.runningSendAction` | `backend/src/services/ai/chats.ts`: queue or cancel the active response and run a follow-up with preserved partial context. |
| `ai.backgroundNotifications` | Chat completion checks native window visibility before notifying. |
| `ai.preventIdleSleep` | Chat execution → Swift `Power.swift` per-run assertions; released after completion/error/stop and host shutdown. |
| `ai.deleteAgentWarning` | UI-only: Settings AI library delete confirmation. |
| `ai.deleteAiCommandWarning` | UI-only: Settings AI library delete confirmation. |
| `ai.chatFolders` | Synced SettingsService, AI Chat sidebar, validated backup restore. |
| `clipboard.recognitionMode` | `core/clipboard.ts` monitor configuration → Swift Vision fast/accurate recognition; OCR text enters history FTS. |
| `clipboard.captureUniversalClipboard` | Native monitoring filters the remote clipboard marker when disabled. macOS does not expose a general public provenance API; unmarked transfers cannot be distinguished. |
| `snippets.expansionMode` | `core/snippets.ts` → Swift `SnippetExpander.swift`: immediate or delimiter keeping/discarding. |
| `snippets.overrideSystemSnippets` | Unavailable/disabled: public APIs cannot reliably override text replacement in other apps; no suppression of user keystrokes or global replacement settings. |
| `snippets.injectionDelay` | Native expander waits, then verifies typing revision and target before resolving/deleting. |
| `snippets.responseTime` | Native expander waits after resolution and rechecks the target before insertion. |
| `snippets.completionSound` | Native expander plays selected NSSound after expansion. |
| `quicklinks.showLinkPreviews` | UI-only: Quicklinks list detail visibility. |
| `quicklinks.preferExistingTabs` | `core/quicklinks.ts` → Swift `Opener.swift`: exact-URL tab activation in Safari/Chromium-family browsers, normal open fallback if unavailable. Requires browser Automation permission. |
| `windowManagement.autoCloseEmptyDesktops` | Unavailable/disabled: removing another app's empty Spaces has no reliable public macOS API. |
| `windowManagement.respectStageManager` | Swift window geometry reserves the recent-app strip while Stage Manager is enabled; uses Dock side to choose the opposite strip side. |
| `calculator.flightTracker` | Unavailable/disabled: no flight-data provider/credential contract exists. No fabricated live flight results. |
| `calculator.weather` | `core/calculator.ts`, `weather.ts`: explicit city queries, Open-Meteo current temperature/today's range, bounded requests/cache, no inferred user location. |
| `calculator.syntaxHighlighting` | UI-only: `launcher/root/CalculatorCard.tsx` switches operator highlighting. |
| `emoji.saveAiCustomKeyword` | Unavailable/disabled: there is no existing AI emoji keyword generation command or RPC to wire. |
| `files.contentSearch` | `core/files.ts`: Spotlight text-content predicate as well as filename. |
| `files.useIgnoreFiles` | `core/file-ignores.ts`: nested .gitignore/.ignore/.rayignore rules and negations. |
| `files.indexNetworkAndRemovableVolumes` | File search filters /Volumes scopes/results unless enabled. |
| `files.keepRemovedVolumeFiles` | Local SQLite volume-result cache; disconnected results only returned when enabled and in current scopes. Caches results observed by searches, rather than maintaining a new full-filesystem index. |
| `applications.directories` | Commands discovery → native Applications scan/watch roots; dev-native scans same directories. |
| `applications.recursiveSearch` | Native/dev scan depth with app bundles treated as leaves; settings invalidate application catalogs. |
| `translator.primaryAction` | UI-only: Translator action ordering selects copy or paste. |
| `developer.disablePopToRootSearch` | Frontend launcher reopen behavior and development extension pop-to-root requests. |
| `developer.openSurgecastInDevelopmentMode` | `backend/src/services/extensions/index.ts` shows launcher after initial development install/build. |
| `developer.useNodeProductionEnvironment` | `backend/src/services/extensions/sessions.ts` worker NODE_ENV. |

## Existing settings needed by the merged UI

| Key(s) | Consumer |
| --- | --- |
| `clipboard.keepHistoryFor`, `disabledApplications`, `saveImages`, `saveFiles`, `textRecognitionEnabled` | Core history/retention and native monitoring/OCR. Pins survive pruning; disabled source IDs and paths are filtered. |
| `snippets.autoExpansionEnabled`, `disabledApplications`, `expandWithinWords` | Core keyword registration/resolution and native target/boundary checks. |
| `windowManagement.innerGap`, `outerGap`, `cycling` | Native geometry: separate display-edge and between-window gaps; half → two-thirds → third → optional quarter cycles. Geometry self-test verifies gap separation. |
| `advanced.backupFrequency`, `backupLocation` | Backup scheduler (daily, weekly, monthly = 30 days); only encrypted scheduled exports with a Keychain passphrase. |
| `advanced.useSystemProxySettings` | Global backend fetch dispatcher uses enabled macOS HTTP/HTTPS proxies and exception suffixes. PAC scripts and SOCKS proxies are not supported. |
| `advanced.faviconProvider` | Existing backend quicklink icons and frontend quicklink model; Google/DuckDuckGo/none. |
| `ai.webSearchProvider`, `webSearchBaseUrl` | Existing configured web tool dispatch; new Keychain controls now supply its credentials. |
| `ai.toolConfirmationMode`, `alwaysAllowedTools` | Existing engine/confirmation handling; approval persisted only when requested. |
| `ai.searchAgents` | Existing command registry and settings invalidation. |
| `developer.autoReloadOnSave`, `keepWindowVisibleDuringDevelopment` | Development extension reload and host launcher behavior; normal production visibility is preserved. |
| `launcher.windowPresentationMode` | Host launcher chooses mouse, primary or previous active-window screen. |

## Validation

Required compiler commands are run inside each package, without adding tsc-rs to
package.json or the lockfile. The only new dependencies are Undici (verified TLS,
HTTP proxies) and ignore (ignore-file semantics).

- `pnpm dlx tsc-rs@0.6.0 --noEmit -p tsconfig.json` in protocol, backend, frontend,
  raycast-api and sync-worker.
- `pnpm -r test`
- `pnpm -r build` (including sync-worker's dry-run build; no deployment)
- `swift build --package-path apps/macos`
- `swift run --package-path apps/macos SurgecastSelfTest`
- `node packages/frontend/scripts/check-mock-pages.mjs` (five entry pages, launcher
  features and Settings routes; errors fail the command)
- `node packages/backend/test/core/e2e.mjs` (fresh bundled backend, authenticated
  WebSocket RPC, SQLite, export/import)

Mock/automated checks do not establish manual acceptance of Keychain dialogs,
NSSavePanel, OCR quality, physical Hyper Key behavior, Automation permission, or
window placement on a running user's desktop. No personal provider credentials
were used in validation.

Final results for this checkout:

| Command | Result |
| --- | --- |
| `pnpm dlx tsc-rs@0.6.0 --noEmit -p tsconfig.json` in each of the five packages | All exit 0, no diagnostics |
| `pnpm -r test` | Exit 0; backend 301, frontend 522, raycast-api 12, sync-worker 7: 842 tests passed |
| `pnpm -r build` | Exit 0 for all packages, including sync-worker dry-run |
| `swift build --package-path apps/macos` | Exit 0, Build complete |
| `swift run --package-path apps/macos SurgecastSelfTest` | Exit 0, geometry and file-boundary checks PASS |
| `node packages/frontend/scripts/check-mock-pages.mjs` | Exit 0; main, ai-chat, notes, settings, gallery PASS, zero errors |
| `node packages/backend/test/core/e2e.mjs` | Exit 0; authenticated bundled backend, contract registration, core workflows PASS |
| User-supplied missing-method scan | `[]` |
