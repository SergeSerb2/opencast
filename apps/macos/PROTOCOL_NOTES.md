# Native integration notes

The native host implements the existing protocol without editing `packages/`.

- The architecture's `opencast-file` backend allow-list has no method to register
  paths. This implementation follows the task's initial policy: data/extensions,
  `/Applications`, `/System/Applications`, `/System/Library/CoreServices`, and the
  user's home, excluding `~/Library/Keychains`. Checks resolve symlinks. Proposal:
  add a backend-only method to register canonical asset roots before narrowing the
  home-directory allowance. Web bridge calls must not be able to extend the list.
- `windows.focused.frame` uses AX absolute points, with an origin at the primary
  display's upper-left. Its declared `WindowLayoutRect` is also used for normalized
  layout fractions. Proposal: introduce an absolute frame type for this result and
  document its coordinate system. `windows.applyLayout` continues to use fractions
  measured from the chosen display's upper-left.
- `WindowKind` includes `welcome` and `theme-studio`, while the architecture's
  frontend bundle lists four pages. The native host supports those kinds and loads
  their corresponding HTML filenames. Frontend should supply these pages before
  showing them; native intentionally does not substitute another page.
- `window.route` is required by the task but absent from `NativeEvents`. Native sends
  `{ kind, route?, payload? }` to the addressed page, including after load/restart.
  Proposal: declare it as a frontend-only native notification.
- macOS has no universal public authorization query for Automation or Full Disk
  Access. Those status values are `unknown`; requests open the corresponding System
  Settings pane. Automation errors from AppleScript return `PermissionDenied` with
  `permission: "automation"`. A future targeted Automation request should name the
  receiving application explicitly.
- Unsupported actions answer with `MethodNotFound` (`-32601`) and an explanation:
  another app's always-on-top, reliable cross-Space window movement, per-app audio
  mute, Bluetooth power, Stage Manager power, and immediate safe hibernation. Audio
  devices that lack hardware volume/mute controls also return a specific error.
  Low Power Mode can require administrator privileges; the host returns `pmset`'s
  error and does not invoke `sudo` or change privileged preferences silently.
- Menu item paths are localized titles, as supplied by AX. Notification Center
  dismissal depends on exposed AX buttons and returns a clear error if unavailable.
  No settings or destructive system actions are executed during smoke testing.
