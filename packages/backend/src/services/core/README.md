# Backend core services

`index.ts` exports `coreServices`, already consumed by the architect's service
registration. No dependency or package configuration changes are required.

## Implementation

- `commands.ts`, `builtins.ts`, `native-commands.ts`, `ranking.ts`: built-in catalog,
  applications, command preferences, native hotkeys, frecency, favorites, suggestions,
  root results and configured fallbacks, optional file results, compatible deeplinks.
  Individual snippets are intentionally absent from root search, matching 2.7.3.
- `calculator.ts`, `colors.ts`: bounded mathjs expressions, percentages, units, currency
  cache, calendar arithmetic, time zones, bases and color conversion. Currency uses
  open.er-api.com without a key, caches for 12 hours, and uses stale rates offline.
- `clipboard.ts`: local SQLite/FTS history, privacy filtering, source exclusions,
  content deduplication, image storage, pinning, retention and native copy/paste.
- `placeholders.ts`, `snippets.ts`, `quicklinks.ts`: reusable dynamic composition,
  argument discovery, date formatting/offsets, cursor distance, modifiers, keyword
  registration, import/export and default search quicklinks.
- `notes.ts`: unlimited markdown entities, derived titles, synchronized FTS indexing,
  recency, pinning and export.
- `emoji.ts`, `files.ts`, `processes.ts`, `system.ts`: emojibase search and usage,
  cancellable Spotlight searches, recent files, process listing/termination,
  native system/window/calendar/menu passthroughs and synced custom layouts.
- `scripts.ts`: metadata parsing, discovery/watchers, templates, argument validation,
  direct execution, confirmation, inline refresh, streaming and cancellation.
- `themes.ts`: synced themes, default dark/light palettes and three classic palettes.
- `config-format.ts`, `data.ts`: all three Raycast container families, synthetic-file
  compatibility tests, category imports and authenticated OpenCast backups.

Syncable user content uses EntityStore. Clipboard, calculator history, emoji usage and
command frecency use local tables. Entity-change listeners also handle remote sync
updates. Startup work runs after migrations; timers, watchers and native subscriptions
are released on shutdown. Secrets are not logged or exported from Keychain.

## Additive protocol changes

`models.ts`:

- `CommandKind` also accepts `file` for optional root file results.
- `CommandArgument.default` carries placeholder defaults to inline argument controls.
- `Theme.colors.accent` preserves the theme's accent palette value.
- `ProcessInfo` describes process identity/resources, with optional native app identity.
  It deliberately excludes command-line arguments.

`native.ts`:

- `clipboard.setSequentialPaste({ contents })`: the Swift host must consume queued
  content on successive physical Cmd-V presses. It must not paste the whole queue
  immediately. Unsupported hosts return their native method error.

`rpc.ts`:

- `commands.setPrefs` adds `unset` to remove aliases, hotkeys or other preferences.
- `windows.layouts.upsert` also accepts a creation request without an `id`; the
  existing request shape remains accepted.
- `system.processes`, `system.killProcess`, `data.storage` support the process/storage
  built-in views.
- `scripts.reload`, `scripts.start`, `scripts.cancel` support discovery and output views.
- `scripts.output`, `scripts.completed` push stream chunks and execution results.
- `clipboard.itemsChanged` reports deletion/clear/prune invalidation. The existing
  `clipboard.changed` item event remains unchanged for inserts, deduplication and pins.

Core polish also adds optional `CommandInfo.suggestionPriority` and
`CommandInfo.installedAt` in `models.ts`. Providers can declare seed order and an
installation timestamp for the temporary new-item suggestions. Empty root returns
Favorites, up to five Suggestions, Commands and Applications in that order, omitting
empty sections and repeated identities. Suggestions use at most two unused new items
for five minutes, then used commands, then seeds without aliases/hotkeys. Built-ins
and common apps provide seeds; used items progressively replace them.

Calculator amounts are evaluated before attaching the currency or unit, including
`2+2*10 usd in eur` and `2+2 km in mi`. Currency display uses `Intl.NumberFormat`
with two decimals and full `Intl.DisplayNames` labels; copy values use the same
rounding without symbols or grouping. Units use about six significant digits and
readable singular/plural names. Input labels and interpretations describe the
original expression rather than the evaluator's rewritten percentage/conversion
syntax. Bare numbers and ordinary launcher words do not produce calculator cards.

## Verification

From the repository root:

```sh
pnpm --filter @opencast/backend typecheck
pnpm --filter @opencast/protocol typecheck
pnpm --filter @opencast/backend test
pnpm --filter @opencast/backend build
node packages/backend/test/core/e2e.mjs
```

The E2E script starts a fresh bundled backend with `--no-native`, uses authenticated
WebSocket JSON-RPC for search, calculator, snippets/quicklinks/notes CRUD, note FTS,
deeplinks and encrypted backup/restore, then terminates the backend and removes its
own temporary data. Unit/service tests cover native notifications with a mock host,
hotkey reconciliation, sync index updates, clipboard retention/image cleanup,
offline rates, script argument safety/streaming/cancellation and synthetic config
containers. Native actions and visual rendering require the other teams' integration.
The calculator regression uses fixed, fresh disk-cached rates to verify the reference
`€19.66` answer without depending on live exchange rates. Root tests also cover fresh
seeds, launch replacement, favorite ordering, exclusions, reset and suggestion limits.

## Compatibility boundaries

Raycast's exact native frecency decay is undocumented; this implementation uses a
smooth 30-day decay. Container tests use synthetic exports, not an owner's real
password-protected export. Import/export containers are bounded to 64 MiB decompressed
content, with errors for oversized exports rather than producing unrestorable files.
Raycast imports preserve supported user content additively rather than deleting
missing existing content. They map snippets, quicklinks, notes, themes, general
settings, AI commands and AI presets; Raycast hosted model references are omitted so
configured OpenCast provider defaults apply.

The docs command supports `OPENCAST_DOCS_URL`; its default GitHub documentation URL
needs confirmation when the project publishes its canonical repository. Sequential
paste requires the new native queue contract above. Other native actions, permissions,
window geometry and view rendering were not verified by the no-native E2E run.
