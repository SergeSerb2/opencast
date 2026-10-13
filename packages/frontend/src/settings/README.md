# Settings window

`settings.html` mounts `settings/main.tsx`. `SettingsApp.tsx` owns the sidebar, native
`window.route` receiver and history shortcuts. `catalog.ts` and `search.ts` index pages
and rows; `pages/` contains the core, feature, installed-extension and AI settings.
`ui/` supplies settings-specific rows, dialogs, recorders and preference editors over
the foundation controls. Scalar controls use the shared `settings.set` bridge and
receive `settings.changed`; text fields commit on Enter or blur.

## Implemented surfaces

General (appearance/themes, interface size, window illustrations, startup and hotkey),
Launcher (ranking/fallback ordering), Keyboard, Shortcuts (extension tree, type/category
filters, aliases/hotkeys/enabled state, preferences, local install/uninstall/Store),
Advanced (Raycast import, encrypted export, scheduled-backup controls, storage, proxy,
certificates), About, all assigned built-in feature pages and installed extensions.

AI includes 18 provider templates, editable endpoint/API/key/secret-header forms,
connection tests, model discovery/manual entry/capability toggles, model defaults,
chat/profile/memory/tools settings, MCP configuration/Claude JSON import/tests, and AI
command and agent CRUD/import/export/reset. Agent JSON import strips identity and
built-in status. Provider and extension password fields never display saved values.

Cloud Sync includes setup and vault confirmation, explanatory self-hosting links,
live status/pending changes, category counts/toggles, devices/removal, not-synced data,
disconnect, unlock and typed confirmation for remote deletion.

## Shared and mock changes

The foundation Dropdown gained a backwards-compatible ghost variant and configurable
menu search; Menu gained configurable search focus. Checkbox gained an optional
`aria-label` for unnamed table cells. The original settings placeholder entry was
replaced by the dedicated settings entry. Browser-native debug output now prints only
method names, never parameters.

`bridge/mock/settings-handlers.ts` supplies realistic provider/model, MCP,
command/agent, extension/preference, script, sync, storage and import/export handlers.
Credential values are represented by Keychain markers/booleans; they are not persisted
in browser storage. Mock IDs are unique during rapid imports and change events match
the protocol. Native permission and hotkey behavior use the foundation browser shim
and keyboard recorder. `?mock.ai.empty=1` shows AI onboarding;
`?set.sync.enabled=true&set.sync.serverUrl=https://sync.example.workers.dev` shows a
connected sync fixture.

## Additive protocol changes (entire branch versus foundation 50c2fe8)

- `AIProviderApi`: `openai-responses`.
- `AIProvider`: optional `modelFetchError` and `secretHeaders`.
- `AIModelCapabilities`: optional `system` and `temperature`.
- `AIPreset`: optional `reasoningEffort`.
- `AICommand`: optional `reasoningEffort`, `highlightEdits`, `tags`.
- `commands.setPrefs`: optional `unset` keys, so alias/hotkey removal survives JSON.
- `ai.providers.templates`: optional `supportedApis`.
- New RPCs: `ai.webSearch.hasApiKey`, `ai.webSearch.setApiKey`, `ai.mcp.import`,
  `data.storage`, `ai.presets.reset`, `data.backup.hasPassphrase`,
  `data.backup.setPassphrase`. Web-search keys and backup passphrases must use
  `ctx.secrets` on the backend; RPCs never return the secret.
- New settings (39 keys, existing keys/defaults unchanged):
  - `advanced`: `backupAutoDelete`, `backupSkipOnBattery`,
    `additionalCertificateAuthorities`, `windowActivationBehavior`, `tidyMenuBar`.
  - `ai`: `runningSendAction`, `backgroundNotifications`, `preventIdleSleep`,
    `deleteAgentWarning`, `deleteAiCommandWarning`, `searchAgents`.
  - `applications`: `directories`, `recursiveSearch`.
  - `calculator`: `flightTracker`, `weather`, `syntaxHighlighting`.
  - `clipboard`: `recognitionMode`, `captureUniversalClipboard`.
  - `developer`: `disablePopToRootSearch`, `openSurgecastInDevelopmentMode`,
    `useNodeProductionEnvironment`.
  - `emoji`: `saveAiCustomKeyword`.
  - `files`: `contentSearch`, `useIgnoreFiles`, `indexNetworkAndRemovableVolumes`,
    `keepRemovedVolumeFiles`.
  - `keyboard`: `escapeKeyClosesWindow`, `builtinHotkeysPreset`,
    `hyperKeyDisplayShortcut`.
  - `quicklinks`: `showLinkPreviews`, `preferExistingTabs`.
  - `snippets`: `expansionMode`, `overrideSystemSnippets`, `injectionDelay`,
    `responseTime`, `completionSound`.
  - `translator`: `primaryAction`.
  - `windowManagement`: `autoCloseEmptyDesktops`, `respectStageManager`.

## Verification

```sh
pnpm --filter @surgecast/frontend typecheck
pnpm --filter @surgecast/frontend test
pnpm --filter @surgecast/frontend build
pnpm --filter @surgecast/protocol typecheck
pnpm --filter @surgecast/backend typecheck
node packages/frontend/src/settings/__tests__/browser-workflows.mjs
node packages/frontend/scripts/screenshot.mjs --settings --out-dir /tmp/surgecast-re/ours/fe-settings
```

Vitest covers search ranking/filtering, catalog anchors, provider validation/key
handling, routing/history, shortcuts/hotkey conflicts, MCP parsing/import, sync setup,
agent portability and mock event/redaction contracts. The final run passed 122 tests in 14 Vitest files and 10 browser workflows.
Browser checks exercise live
mock writes/events, provider setup/key removal/models, agent create/import/export/reset,
MCP secrets/import validation, sync setup/category/device removal, alias cancel/save,
hotkey recording and per-category Raycast import results. The screenshot script captured 49 settings scenes. Screenshots use an 800×640
viewport at 2× resolution and include every page, menus, editors, onboarding and
connected sync. Compare only with `specs/design.md` and `ref/share/settings-redacted.png`.

## Integration boundary

This checkout contains empty backend AI/extensions/sync/core service registrations.
The settings UI and mocks are implemented; those backend/native teams must provide the
RPC implementations and consume the added setting keys. Typechecking the backend does
not prove provider network requests, disk export/backup, encrypted sync, extension
installation or macOS permissions/hotkeys. The mock imports/exports simulate results,
not real file operations. Theme Studio, the extension Store and sync deployment/docs
are owned by their respective teams; Store is disabled when no Store command is
registered. Native Keychain storage, encrypted Worker sync and real macOS execution
remain unverified in this branch. No backend/native files or root configuration were
changed by this team.
