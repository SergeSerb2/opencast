# Notes window

`notes.html` mounts `NotesApp` with the shared theme, backend/native bridges,
overlay host, and browser backdrop. The editor uses TipTap 3 and stores Markdown;
underline uses TipTap's `++text++` representation.

- `editor/`: schema, Markdown paste, syntax highlighting, list movement, virtual
  selection, and find/replace.
- `controller.ts` and `lib/note-session.ts`: debounced saves, first-edit creation,
  caret restoration, navigation history, note actions, and idle sync merges.
  Navigation waits for pending writes and retains the current note on failure.
- `components/`: title bar, floating count/format controls, window pin toggle,
  browser, find/replace, and link editor. Note pinning and window floating are
  independent settings.
- `__tests__/`: Markdown node/mark round-trips, input rules, title derivation,
  editor plugins, lifecycle races, sync behavior, routes, and export handling.

The header reserves space for the host's traffic lights. Native sizing measures
content including chrome once, clamps to 128–860px, and accommodates open panels.
The 396×500 mock screenshots use the foundation's `scripts/screenshot.mjs` scenes.

Native export uses the additive `dialog.saveFile` protocol method: an NSSavePanel
that writes the supplied UTF-8 content and returns a path or null on cancellation.
Browser export downloads a Blob. An unsupported native host gets an explicit
error instead of a success toast. The Swift implementation belongs to the host
team. Attachments and Recently Deleted are not exposed by the current notes RPCs.
