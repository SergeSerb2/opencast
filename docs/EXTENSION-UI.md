# Extension UI tree contract

Raycast-compatible extensions render React elements from `@raycast/api` inside a worker
thread. OpenCast's runtime (`packages/raycast-api`) runs a React reconciler and sends the
resulting tree to the frontend as `UINode` objects (`packages/protocol/src/ui.ts`). The
frontend renders built-in views and extension views with the same components.

This document is the contract between the runtime (producer) and the frontend renderer
(consumer).

## Delivery

- Backend event `ext.session.updated` carries `ExtensionSessionState`
  (`models.ts`): `{ sessionId, root, depth, isLoading, navigationTitle }`.
- `root` is the **top** of the extension's navigation stack. Views below it stay mounted
  in the worker; the frontend shows only `root`.
- Updates are full trees, throttled by the runtime to at most one per animation frame
  (~16 ms). The frontend reconciles by `UINode.id` (stable per element) to keep selection
  and scroll position.

## Node shape

```ts
interface UINode {
  type: string;                    // Raycast component path
  id: string;                      // stable id (React key + position)
  props: Record<string, unknown>;  // serialized props (rules below)
  children: UINode[];              // element children in order
}
```

### `type` values

The dotted component path as used in code:

- `List`, `List.Section`, `List.Item`, `List.Item.Detail`, `List.Item.Detail.Metadata`,
  `List.Item.Detail.Metadata.Label`, `.Link`, `.TagList`, `.TagList.Item`, `.Separator`,
  `List.Dropdown`, `List.Dropdown.Section`, `List.Dropdown.Item`, `List.EmptyView`
- `Grid`, `Grid.Section`, `Grid.Item`, `Grid.Dropdown` (+ `.Section`, `.Item`), `Grid.EmptyView`
- `Detail`, `Detail.Metadata` (+ `.Label`, `.Link`, `.TagList`, `.TagList.Item`, `.Separator`)
- `Form`, `Form.TextField`, `Form.PasswordField`, `Form.TextArea`, `Form.Checkbox`,
  `Form.DatePicker`, `Form.Dropdown` (+ `.Section`, `.Item`), `Form.TagPicker` (+ `.Item`),
  `Form.FilePicker`, `Form.Separator`, `Form.Description`, `Form.LinkAccessory`
- `ActionPanel`, `ActionPanel.Section`, `ActionPanel.Submenu`
- `Action`, `Action.CopyToClipboard`, `Action.Paste`, `Action.OpenInBrowser`, `Action.Open`,
  `Action.OpenWith`, `Action.ShowInFinder`, `Action.Trash`, `Action.Push`,
  `Action.SubmitForm`, `Action.CreateSnippet`, `Action.CreateQuicklink`,
  `Action.ToggleQuickLook`, `Action.PickDate`
- `MenuBarExtra`, `MenuBarExtra.Item`, `MenuBarExtra.Section`, `MenuBarExtra.Submenu`
  (rendered natively by the backend → `menubar.set`, never by the frontend)

### Prop serialization

| Prop value in React | On the wire |
|---|---|
| string / number / boolean / null | as is |
| `undefined` | omitted |
| function (`onAction`, `onSearchTextChange`, `onChange`, `onSelectionChange`, …) | `{ "$handler": "<id>" }` (HandlerRef) |
| React element (`actions`, `detail`, `metadata`, `searchBarAccessory`, `accessory`, `target` of `Action.Push`) | a `UINode` |
| `Date` | `{ "$date": "<ISO string>" }` |
| arrays / plain objects | recursively serialized with the same rules |

`Image.ImageLike`, `Color.ColorLike`, `Keyboard.Shortcut` keep the public shapes
(see `ui.ts`). `Icon.*` values are the Raycast enum strings (e.g. `"clipboard-16"`).
Extension asset names (e.g. `"logo.png"`) are resolved by the runtime to absolute paths
before sending.

## Invoking handlers

The frontend calls `ext.session.dispatch({ sessionId, handlerId, args })`. `args` are the
JS arguments the extension's callback expects:

| Prop | args |
|---|---|
| `List.onSearchTextChange`, `Grid.onSearchTextChange` | `[text]` |
| `List.onSelectionChange` | `[itemId \| null]` (`List.Item.id` prop, else the node id) |
| `List.Dropdown.onChange`, `Form.*.onChange` | `[value]` |
| `Form.*.onBlur` / `onFocus` | `[{ target: { id, value }, type: "blur" \| "focus" }]` |
| `List.pagination.onLoadMore` | `[]` |

### Actions

The runtime gives **every** `Action*` node a `props.onAction` HandlerRef, even when the
extension did not pass one; built-in action behavior (copy, paste, open, push, trash, …)
runs inside the runtime, which then calls the extension's own callback
(`onCopy`, `onPaste`, `onPush`, …). The frontend only dispatches `onAction` with:

```ts
args = [{ formValues?: Record<string, unknown> }]
```

`formValues` is required for `Action.SubmitForm` and for any action inside a `Form`: the
frontend keeps values of uncontrolled form fields (keyed by field `id`) and sends them.
Controlled fields (`value` prop present) report each change through `onChange`.

The frontend handles these locally:

- the first action in the panel is the primary (↵), the second the secondary (⌘↵);
- `shortcut` props bind keys while the view is focused;
- `Action.Push` dispatches `onAction`; the runtime pushes and sends a new `root`
  with `depth + 1`;
- Esc calls `ext.session.pop` (the runtime pops, or the session closes at depth 1).

## Toasts, alerts, HUD, navigation

- `showToast` → backend event `ext.toast` (frontend shows it in the footer). Toast actions
  call `ext.toast.action`.
- `confirmAlert` → backend event `ext.alert` → frontend shows the alert sheet and replies
  with `ext.alert.respond`.
- `showHUD`, `closeMainWindow`, `popToRoot`, `launchCommand` are executed by the backend
  (native calls and `launcher.navigate` events).
