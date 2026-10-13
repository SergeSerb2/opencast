# Extensions in OpenCast

OpenCast runs built Raycast extension commands without rewriting their JavaScript.
The implementation lives in `packages/raycast-api` and
`packages/backend/src/services/extensions`. The public API declarations and enum
constants come from the MIT-licensed public API; the runtime and host are original.
No Raycast artwork or proprietary implementation is included.

## Execution

Each command or tool execution receives a fresh Node worker with a 512 MiB JS heap
limit. Extensions have ordinary Node filesystem, process and network access, matching
the extension trust model. The worker intercepts only `@raycast/api`, `react`,
`react/jsx-runtime` and `react/jsx-dev-runtime` imports. Other dependencies resolve
normally from the extension's folder. Standard store bundles include their utilities.

`build.mjs` produces `dist/runtime.cjs`, `dist/worker.cjs`, declarations, notices and
shared React/reconciler/scheduler modules. Keep this whole directory together when
packaging the application. The backend finds it at `Resources/raycast-api/`, at the
monorepo package path, or through `OPENCAST_EXTENSION_WORKER`.

The API uses React 19 and a persistence reconciler. Commits send full UINode trees at
most once per 16 ms, following `EXTENSION-UI.md`. React element props such as actions,
metadata and detail remain live React subtrees. Only the selected List/Grid item's
actions and detail mount. Duplicate item IDs keep the first serialized item. Callback
IDs are stable for the lifetime of their elements; menu callback IDs also survive a
fresh worker. Form dates use `$date` markers. Relative image assets resolve to absolute
paths. Built-in actions execute in the worker, followed by the extension's callback.

Navigation pushes retain the mounted views underneath the top view. Pop restores
that view and invokes its onPop callback. Errors produce a failure toast and error
view; worker crashes close the session. Async no-view commands are awaited. A toast
with callbacks retains its no-view worker for up to ten minutes so its actions work.
Otherwise completed no-view commands unload immediately.

All public runtime exports and deprecated aliases are present, including 478 Icon
names and 176 AI.Model keys. This is API-surface coverage, not proof that every store
extension works.

## Install and launch

The backend registers the `extensions` command provider and `ext` tool provider.
Command IDs are `ext:<extension>.<command>`; tool names use the same format.
The core launcher can launch these through the command registry.

The host also provides an independent session entry point, useful for extension
frontends, development and headless verification:

```json
{"method":"extensions.install","params":{"source":"store","idOrSlug":"codedbyjordan/markdown-reference"}}
{"method":"ext.session.start","params":{"name":"markdown-reference","command":"markdown-reference","launchType":"userInitiated"}}
```

`ext.session.start` returns a LaunchResult: an extension session, a preferences setup
view, or a completed no-view result. Optional launch arguments, fallbackText,
launchContext and draftValues are supported. The existing session RPCs retrieve
state, dispatch callbacks, pop and close. Toast actions and alert replies have their
own RPCs. Session trees arrive through `ext.session.updated`.

Store search, details, README retrieval, install and version updates use the public
store API at `https://backend.raycast.com/api/v1`. Anonymous access was verified.
Owners can override the base with `OPENCAST_EXTENSION_STORE_URL`. Store updates
compare commit/version identity. Installation stages the new package and backs up
an existing install before replacing it; a failed database write restores the old
files. ZIPs are checked for traversal, absolute paths, duplicate destinations,
symlinks/special files, file-directory collisions, checksums and size mismatches.
Limits are 50 MiB compressed, 250 MiB expanded and 2,000 entries.

For a local installation, pass `{"source":"local","path":"/absolute/path"}`.
A built root, a `dist` folder, or a source project with built `dist` output is accepted.
The host does not build source projects or install their dependencies automatically.

## Preferences and data

Installed extension metadata uses EntityStore collection `extensions`; command
preferences use `commandPrefs`. Non-secret preferences merge extension values,
command values and platform defaults. Required missing preferences prevent launch
and return the `extension.preferences` setup view. Dropdown membership, booleans,
file/directory types and application selection are validated.

Install paths and development source paths are stored only in `localState` and
joined into the extension list on this device. Paths from synced metadata are
ignored. Another device must install the extension's files locally.

Password preferences use Keychain accounts `ext:<name>:pref:<preference>`.
Remembered Form.PasswordField values use
`ext:<name>:form:<command>:<field>`, never the cache. OAuth tokens use
`oauth:<name>:<providerId>`. Uninstall removes those tracked secrets and preserves
developer source folders. LocalStorage and support/cache data remain available for
reinstallation. Secrets never enter synced entities or extension logs; arbitrary
worker stdout/stderr is drained without forwarding it into backend logs.

LocalStorage uses the local `extension_storage` SQLite table and is shared between
commands of an extension. Cache is synchronous, namespaced, persisted in a separate
SQLite database under `extension-support/<name>/com.opencast.api.cache/`, and evicts
by UTF-8 value size/LRU. Its default capacity is 10,000,000 bytes. Cache subscriptions
work across Cache objects in a worker, including the unbound subscribe function used
by `@raycast/utils.useCachedState`. Cache and LocalStorage do not sync.

## AI, OAuth and tools

AI.ask is a streaming, abortable Promise with data events. Every request delegates
to `ctx.ai.complete` with purpose `extension`; there is no hosted fallback. Model
selectors must match an enabled configured model/ref, an equivalent provider-prefixed
ID, or an explicit local alias. The host rejects missing models clearly. Decision
requests also use the configured engine and validate their JSON answers.

PKCE authorization generates a random state/verifier and SHA-256 challenge. The
host opens the provider URL and accepts a matching state from `opencast://oauth`
or `raycast://oauth` native URL events. Flows expire and state cannot be reused.
Providers must accept the OpenCast redirect and the extension's own client ID.
OpenCast does not use Raycast's OAuth proxy or client metadata servers. Bundles
that hardcode Raycast-owned OAuth clients/redirects need provider-side configuration
or an extension change. Token refresh and exchange remain the extension's job.

Tools run in fresh workers. Manifest input schemas, including optional `ai.tools`
schemas, are advertised and validated with AJV. Non-object schemas wrap under
`input`. Declared confirmation exports run separately and show their message before
execution. Functions in tool results are recursively awaited before the result is
returned. Tool execution has a two-minute worker deadline and supports cancellation.

## Menu bar and intervals

MenuBarExtra trees map to native `menubar.set` items, including submenus, sections,
separators, shortcuts and alternate items. Last trees persist in localState through
shutdown. A native click/open can reload a worker and rediscover its stable callback.
Menu loads are coalesced. Explicit removal/uninstall closes the native item.

Intervals accept s/m/h/d units with a ten-second minimum. Only command preferences
with `intervalEnabled: true` schedule refreshes. Jobs never overlap per command and
run with at most eight jobs concurrently. Sleep pauses scheduling; wake schedules
from the current time instead of replaying missed intervals.

## Development

Build the extension with its own build script, then call:

```json
{"method":"extensions.develop","params":{"path":"/absolute/path/to/project"}}
```

OpenCast watches JS, JSON and asset changes recursively, coalesces rebuilds for
250 ms, reloads active view/menu workers and preserves launch arguments/context.
It leaves the developer's files in place. Build failures surface as a toast. Pending
reloads finish before uninstall/shutdown so they cannot resurrect an uninstalled
extension. This workflow does not emulate the external `ray develop` CLI's URL events.

## Verification recorded on 2026-10-13

Both packages built and typechecked. Vitest passed 12 runtime tests and 16 backend
host tests. They cover serialization, mounted selection/detail, Form refs/submission,
action callbacks, navigation retention, cache/LRU/subscriptions, PKCE/token expiry,
streaming AI, local installation, missing/secret preferences, sync-local path handling,
tool validation/confirmation, native menu mapping/reload/persistence, error views,
development reload and sleep-aware scheduling.

A fresh disposable backend ran with `--no-native`, and verification used authenticated
WebSocket RPC. Store JavaScript was downloaded and executed unchanged.

| Bundle | Command | Verified result |
|---|---|---|
| Extension Template | static-list | List with 3 items |
| Extension Template | detail | Detail markdown |
| Extension Template | form | Form with fields and submit action |
| Extension Template | grid | Grid with all 478 API icon entries |
| Extension Template | list-and-detail | List, push to Detail, pop to retained root |
| Extension Template | menu-bar-extra | MenuBarExtra tree |
| Extension Template | blank / script | Awaited no-view completion; script requested window close |
| Extension Template | typeahead-search | Populated List with bundled utils/useFetch; search callback |
| Extension Template | ai | Detail renders; unconfigured AI failure surfaced correctly |
| codedbyjordan/markdown-reference | markdown-reference | 15 List items; search, View action to Detail, pop and close |
| joshuaiz/password-generator | generate-random-password | Form; controlled input change |
| thomas/hacker-news | frontpage | Network-backed List with 30 articles |
| braydoncoyer/office-quotes | index | 326 List items; push to Detail, pop and close |
| koinzhang/menubar-calendar | index | MenuBarExtra with 15 nodes; calendar access was denied |

Store versions, timestamp, node counts and observed failure toasts are recorded in
`packages/backend/test/extensions/compatibility-report.json`. Markdown Reference
and Hacker News used commit `3c654737b0d566d3103fcdf72221a9f34664bdf2`; Password
Generator used `c7bb9d4e7481fb6a71e2c1712c809e52be0b2955`; Office Quotes and MenuBar
Calendar used `c33bf4cb4b9ad70c2b93432ee713ffb7486ed331`.

Reproduce after building both packages:

```sh
node packages/backend/dist/index.mjs --no-native --dev \
  --resources "$PWD" --data-dir /tmp/opencast-extension-check --port 18943 --token t
# In a second terminal:
node packages/backend/test/extensions/verify-store.mjs 'ws://127.0.0.1:18943/rpc?token=t'
```

The opt-in runner downloads the public bundles and emits its report. Set
`OPENCAST_EXTENSION_REPORT` to save JSON. It returns a failing status for incorrect
view types or missing setup. Unit tests use temporary fixtures and do not need store
access.

## Compatibility limits and integration work

Headless trees do not prove native menu display, GUI layout or macOS permissions.
The Calendar bundle reported accessDenied; its calendar data was not verified. Live
AI completion could not run in this worktree because its architect-provided AI service
is still a scaffold. Unit tests verified streaming/cancellation through a configured
engine fixture. OAuth state validation and Keychain routing were tested with a native
fixture; live provider login/refresh remains unverified.

BrowserExtension methods return an explicit unsupported error and canAccess reports
false. The current native API cannot enumerate macOS Spaces or all desktop windows.
WindowManagement reports this clearly. It can read/move the focused window using
native screen geometry; multiple displays require the new optional screenId field.
Native focus metadata does not currently expose richer fullscreen/resizability flags.

The frontend must implement the binding UINode contract, setup view, alerts/toasts
and the additive `ext.ui.control` events for field focus/reset, shake and search clear.
Uncontrolled form/draft persistence beyond supplied draftValues is a frontend concern;
the runtime remembers explicit storeValue fields. Notes/snippet/quicklink/MCP APIs
forward to the core/AI services, which must be registered by their owning teams.
Custom React components supplied as Action.Push targets stay lazy; their actual tree
is sent when pushed. Cache subscriptions do not notify other already-running workers
immediately; reads in those workers still see the shared SQLite values. Custom model
provider entrypoints and the external development CLI protocol are not hosted here.

One additional downloaded bundle, `michaelfarquhar/lorem-picsum` at commit
`3c654737b0d566d3103fcdf72221a9f34664bdf2`, failed with `n.map is not a function`.
Its bundled fetch parser produces an already-wrapped pagination result which its
bundled default mapper wraps again. The response endpoint returned valid image JSON.
The bundle was left unchanged and is not counted as a compatibility pass.

## Additive protocol changes

- `BackendMethods["ext.session.start"]`: direct launch with arguments, fallback text,
  launch context, launch type and draft values; returns LaunchResult.
- `BackendEvents["ext.ui.control"]`: focus/reset/shake/clearSearchBar with session ID
  and optional form item ID.
- `ExtensionToolManifest.input` and `.confirmation`: optional schema and confirmation
  metadata already present in built manifests.
- `MenuBarExtraItem.alternate`: optional native alternate menu item.
- `NativeMethods["windows.focused"].result.screenId`: optional screen identity for
  correct pixel/fraction conversion on multiple displays.

No existing protocol member was removed or renamed.
