# @surgecast/frontend

React 19 + Vite multi-page UI for every Surgecast window: `main.html` (launcher),
`ai-chat.html`, `notes.html`, `settings.html`, plus the dev-only `gallery.html`.
The design source of truth is the Surgecast design spec (tokens, metrics, motion);
components reproduce Raycast 2.7.3's launcher look (Liquid Glass, 750×475).

```
src/
  app/          mountWindow(), dev backdrop (simulated glass window in a browser)
  bridge/       backend RPC client, native bridge, mock backend, React hooks, settings
  theme/        tokens.css, base.css, glass.css, palettes, ThemeProvider
  icons/        <Icon>, <Image> (every Raycast ImageLike), tiles, Raycast Icon → lucide map
  components/   design system (List, Grid, Detail, Form, ActionPanel, Footer, controls…)
  launcher/     main.html: navigation stack, views registry, root search, window behavior
  extension-renderer/  UINode trees from extension sessions → components
  pages/        entry points of the secondary windows
  gallery/      component gallery + full-window demos (dev only)
```

## Running

```sh
pnpm --filter @surgecast/frontend dev          # http://localhost:5173/main.html (mock backend)
pnpm --filter @surgecast/frontend typecheck
pnpm --filter @surgecast/frontend test
pnpm --filter @surgecast/frontend build        # dist/*.html, base "./" for surgecast-app://app/
node packages/frontend/scripts/screenshot.mjs  # PNGs at 750×475 @2x in packages/frontend/.screenshots/
```

Backend selection, in order: `window.__SURGECAST__` (injected by the native host, or by
the Vite dev server when `SURGECAST_BACKEND_URL` and `SURGECAST_TOKEN` are set), then URL
parameters `?backend=ws://127.0.0.1:PORT/rpc&token=…`, otherwise the in-browser **mock
backend** (`?mock=1` forces it). Other dev URL parameters: `?appearance=light|dark`,
`?macos=26|27`, `?window=<kind>`.

In a plain browser the page draws a wallpaper and a rounded glass window at the native
size (`DevBackdrop`); inside the Swift host the page is transparent and the native glass
shows through. `window.hide`, `hud.show` and `window.setContentHeight` are simulated
(⌥Space or a click brings a hidden launcher back).

Screenshot scenes: `node scripts/screenshot.mjs --list`. Custom:
`node scripts/screenshot.mjs --url "gallery.html#form" --out form`.

## Bootstrapping a window

```tsx
// src/pages/notes/main.tsx
import { mountWindow } from "../../app/mount";
mountWindow(<NotesApp />);
```

`mountWindow` installs the native event receiver, applies theme attributes before the
first paint, wraps the app in `ThemeProvider`, the dev backdrop, the overlay layer used
by popovers/menus, and the `confirmAlert` host. Windows without the launcher footer
should render `<FloatingToastHost />` so `showToast` appears as a floating toast.

## Bridge (`src/bridge`)

| API | Use |
|---|---|
| `backend.call(method, params, { signal?, timeoutMs? })` | Typed JSON-RPC call (`BackendMethods`). Void-param methods take no params. Aborting sends `$/cancel`. Calls made while reconnecting are queued. |
| `backend.on(topic, fn)` → unsubscribe | Backend push events (`BackendEvents`). |
| `useBackend(method, params, deps?, { enabled, refetchOn, keepPreviousData, select })` | Query hook: `{ data, error, isLoading, refetch, setData }`. Cancels stale requests, refetches after related events (`bridge/refetch.ts`) and after reconnects. |
| `useEvent(topic, fn)` / `useNativeEvent(topic, fn)` | Subscribe for the component's lifetime. |
| `useSettings()` → `{ settings, loaded, set }`, `useSetting(key)`, `setSetting(key, value)`, `getSetting(key)` | All settings with defaults until loaded; optimistic writes; live via `settings.changed`. |
| `useConnectionState()` | `"connecting" \| "open" \| "reconnecting" \| "closed"`. |
| `native.call(method, params)` / `native.on(topic, fn)` | Swift host API (`NativeMethods` / `NativeEvents`) through `webkit.messageHandlers.native`. In a browser, `native-mock.ts` resolves sensible defaults (no-op window calls, `navigator.clipboard`, dev HUD) and rejects the rest with `NativeUnavailable`. |
| `getEnv()` | `{ backendUrl, token, window, macOSMajor, native, mock, dev, … }`. |
| `RpcError`, `isCancelled(e)`, `errorMessage(e)` | Error helpers (`bridge/errors.ts`). |

The mock backend (`bridge/mock/`) implements a realistic subset of `BackendMethods`
with fixtures: apps and built-in commands with tile icons, quicklinks, snippets,
clipboard items (text, link, color, image, file), notes, AI chats with markdown/code,
providers/models, settings, extension preferences, and sample extension sessions
(`GitHub › My Pull Requests` list with detail, `Create Issue` form, `Repository Readme`
detail, `Unsplash › Search Photos` grid). Add fixtures there when you build a view.

## Theme (`src/theme`)

`tokens.css` holds the spec's token sheet (scaled `--space-*`, `--font-size-*`, `--icon-*`,
radii, motion, chrome heights) and the default palettes; `.theme-root` derives
`--{color}-{0,5,10,15,20,30,40,60,80}` ramps and the semantic tokens
(`--color-text-primary/secondary/tertiary`, `--color-border-separator`,
`--color-surface-token`, `--selection-10`, …). `ThemeProvider` applies the active theme
(`general.appearance`, `general.themeDark/Light`, user `Theme`s with computed contrast
colors), `--zoom` from `general.uiZoom`, `[macos="26|27"]`, `[native]` and
`[window-blurred]`. Read the appearance with `useTheme()`.

Text helpers: `.sc-text`, `.sc-text-small`, `.sc-text-strong`, `.sc-heading-1/2`,
`.sc-mono`, `.sc-truncate`, `.sc-color-secondary/tertiary`.

Glass: `.sc-glass-control` (footer pills, glass buttons) and `.sc-glass-panel`
(popovers, cards). Inside the host they use WebKit's system glass
(`-apple-visual-effect`); elsewhere a CSS approximation. **Do not put `z-index` on
ancestors of glass elements** (headers, footers, overlay layers): a stacking context
cuts the content out of the blurred backdrop. Do not animate transforms on glass elements.

## Icons (`src/icons`)

- `<Icon name="clipboard-16" size={16} color? />` — Raycast `Icon` enum values (all 471,
  see `raycast-icons.generated.ts`), short names (`"star"`), `number-NN-16`, and Surgecast
  glyphs (`surgecast-logo`, `menu-20`). 1.5px strokes in `currentColor`.
- `<Image source={imageLike} size={22} placeholder? tintColor? />` — any `ImageLike`:
  enum glyphs, emoji, http/data URLs, absolute paths (`surgecast-file://`),
  `{ fileIcon }` (`surgecast-icon://`), `{ light, dark }`, `{ source, tintColor, mask, fallback }`,
  and tiles `{ tile: { glyph, background: [top, bottom] } }` (built-in command icons).
- Named colors (`raycast-blue`…) resolve to theme contrast colors (`icons/colors.ts`).

## Components (`src/components`, import from `"../components"`)

### Views (Raycast-style API)

```tsx
<List searchBarPlaceholder="Type to filter entries…" isShowingDetail navigationTitle="Clipboard History"
      navigationIcon={icon} searchBarAccessory={<List.Dropdown tooltip="Type">…</List.Dropdown>}>
  <List.Section title="Today" subtitle="3">
    <List.Item id="1" title="Hello" subtitle="…" icon="blank-document-16"
               accessories={[{ text: "Command" }, { tag: { value: "Draft", color: "raycast-green" } }, { date }]}
               detail={<List.Item.Detail markdown="…" metadata={<Metadata><Metadata.Label title="Type" text="Text" /></Metadata>} />}
               actions={<ActionPanel><Action title="Paste" onAction={paste} /><Action.CopyToClipboard content="…" /></ActionPanel>} />
  </List.Section>
  <List.EmptyView title="No Snippets Found" description="…" actions={…} />
</List>
```

- `List` props: `searchText`/`onSearchTextChange` (controlled or not), `filtering`
  (default: on unless `onSearchTextChange`), `throttle`, `isLoading`, `navigationTitle`,
  `navigationIcon`, `searchBarAccessory`, `actions`, `isShowingDetail`, `selectedItemId`,
  `onSelectionChange`, `pagination`, plus `size` (`large` 38px / `small` / `multiline`),
  `detailWidth`, `primaryActionTitle`. Items also accept `titleRanges` (highlight),
  `iconDot` (running app), and `height` + `render` for custom rows (calculator card).
  Accessories: `text`, `icon`, `tag`, `date`, `tooltip`, plus `alias`, `shortcut`, `onlyWhenSelected`.
- `Grid` (+ `Grid.Section`, `Grid.Item`, `Grid.Dropdown`, `Grid.EmptyView`): `columns`,
  `aspectRatio`, `fit`, `inset`; item `content` is an `ImageLike`, emoji, or `{ color }`.
- `Detail` (`markdown`, `metadata`, `actions`, `navigationTitle`, `isLoading`, or children).
- `Form` with `Form.TextField`, `PasswordField`, `TextArea`, `Checkbox`, `Dropdown` (+`.Item`/`.Section`),
  `TagPicker` (+`.Item`), `DatePicker`, `FilePicker`, `Separator`, `Description`, `LinkAccessory`.
  Fields take `id`, `title`, `info`, `error`, `value`/`defaultValue`/`onChange`, `storeValue`.
  The primary action runs with ⌘↵; `<Action.SubmitForm onSubmit={(values) => …} />` receives values.
- Children must be the marker elements themselves (arrays and fragments are fine); wrap
  data in `.map()` rather than custom row components.

### Actions

`<ActionPanel title?>` with `<Action title icon shortcut style="destructive" onAction>`,
`<ActionPanel.Section title>`, `<ActionPanel.Submenu title …>`, and built-in kinds
`Action.CopyToClipboard`, `Action.Paste`, `Action.OpenInBrowser`, `Action.Open`,
`Action.ShowInFinder`, `Action.Trash`, `Action.Push` (pushes `target`), `Action.SubmitForm`.
The first action is ↵ (⌘↵ in forms), the second ⌘↵; `shortcut`s work while the view is
focused; ⌘K opens the panel. Any `actions` prop also accepts an `ActionPanelModel`
(`{ title?, sections: [{ title?, actions: ActionModel[] }] }`).

### Building custom views

`ViewFrame` is the launcher chrome used by List/Grid/Detail/Form: overlay header with
`searchBar` / `headerContent` / `headerAccessory`, full-height content, footer pills
(navigation title, toast, `[Primary ↵] [Actions ⌘K]`), action panel, Esc handling.
Inside it, content calls `useRegisterActions(actions)` for the footer/⌘K, and
`useViewController()` for `registerKeyHandler`, `focusSearch`, `runAction`, `openActions`.
`useNavigation()` gives `push(<View />)`, `pop()`, `popToRoot()`, `depth`, `isActive`.
Lower-level pieces: `ListBox` (virtualized keyboard list), `VirtualList`, `ScrollArea`
(overlay thumb + edge fades), `Menu`, `Popover`, `SearchBar`, `QuickAiHint`, `Footer`,
`ActionButton`, `ActionPanelPopover`, `MetadataView`, `ItemDetail`, `Markdown`
(`variant="detail" | "chat"`, shared with AI Chat).

### Controls and feedback

`Button` (default/secondary/destructive/ghost/standout/glass/primary; mini–large),
`IconButton`, `Keycap`, `Shortcut`, `Switch`, `Checkbox`, `SegmentedControl`,
`TextField`, `TextArea`, `TagInput`, `Dropdown` (`field`/`small`/`nav`), `Tooltip`, `Tag`,
`Badge`, `NumberBadge`, `AliasBadge`, `Spinner`, `ActivityIndicator`, `LoadingBar`,
`EmptyView`, `AlertDialog`, `InlineToast`.

`showToast({ style: "animated" | "success" | "failure", title, message, primaryAction })`
returns `{ update, hide }`; `showFailureToast(title, error)`; `showHUD(text)` hides the
launcher and shows the native HUD; `await confirmAlert({ title, message, primaryAction: { title, style: "destructive" } })`.

## Launcher (`src/launcher`)

- **Navigation** (`navigation.ts`): a zustand stack whose first entry is root search.
  Entries: `builtin` (a `BuiltinView` from `commands.launch`), `element` (pushed React
  element, e.g. `useNavigation().push(<Detail …/>)`), `extension` (an extension session),
  `quick-ai`. Lower entries stay mounted (hidden) so popping restores state.
- **Views registry** (`views/registry.ts`): `registerView(id, Component)` maps a
  `BuiltinView.id` to a component receiving `LauncherViewProps` `{ props, title, icon,
  commandId, view }`. Register in a module and import it from `views/index.ts`. Built in:
  `script-output` (`ScriptOutputView`) and `extension.preferences` (form generated from
  preference manifests via `extensions.getPreferences/setPreferences`, relaunching the
  command when `launchCommandId` is set). The AI team registers `"quick-ai"`
  (props `{ prompt?, aiCommandId?, presetId? }`); unregistered ids show "View Unavailable".
- **Launching** (`launch.ts`): `launchCommand(id, { arguments, fallbackText, source, title, icon, replace })`
  calls `commands.launch` and routes the `LaunchResult` (push view / extension session /
  Quick AI or AI Chat / HUD or hide / failure toast); `handleLaunchResult` for results that
  arrive otherwise (`launcher.navigate`), `hideLauncher()`.
- **Root search** (`root/`): `search.root` per keystroke (stale requests cancelled),
  calculator card, sections with match highlighting, alias/hotkey/type accessories, running
  dots, `Use “query” with…` fallbacks, inline arguments (Tab moves into them), Tab → Quick AI
  (`ai.tabToAskAi`), ⌘1–9 number hints, compact-mode favorites, the root menu (⇧⌘K), and the
  per-kind action panel (Open, Show in Finder, Copy Path/Deeplink, Favorites + Move Up/Down,
  Configure, Set Alias…, Set Hotkey…, Quit/Force Quit, Reset Ranking, Disable).
- **Window behavior** (`useLauncherBehavior.ts`): Esc per `keyboard.escapeKeyBehavior`, ⌘,
  settings, ⌘W hide, pop to root after `launcher.popToRootTimeout` on `window.didShow`,
  native `window.route` (`command:<id>`, `root`, `quick-ai`), `launcher.navigate`,
  `launcher.toast`, `ext.toast`, `ext.alert`, `ext.session.closed`, and
  `window.setContentHeight` (475, or 64 in compact mode at an empty root).

## Extension renderer (`src/extension-renderer`)

`ExtensionSessionView` listens to `ext.session.updated`, keeps one layer per extension
navigation depth, and renders `UINode` trees (docs/EXTENSION-UI.md) with the same List,
Grid, Detail and Form components. Handlers become `ext.session.dispatch` calls with the
documented arguments; actions inside forms send `{ formValues }` (Dates as `{ $date }`);
search text stays local and is dispatched (debounced with `throttle`); `filtering`,
`isLoading`, `pagination`, `selectedItemId`/`onSelectionChange`, dropdown accessories,
`Form.LinkAccessory` and `navigationTitle` are supported. Pure mapping lives in
`mapping.tsx` / `actions.ts` (unit-tested). Esc calls `ext.session.pop`.

## Conventions

- Plain CSS next to each component, classes prefixed `sc-`, tokens only (no raw sizes
  unless the spec gives a literal). Spec metrics are in px at zoom 1.
- No CSS transitions until `.transitions-ready` (set two frames after boot).
- Keep Raycast's behavior: selection is instant, hover fades out in 70ms, Esc pops.
- Protocol types come from `@surgecast/protocol`; additive changes only.
