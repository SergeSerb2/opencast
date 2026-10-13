/**
 * UI value types shared by built-in views and the extension renderer.
 *
 * The shapes match the public `@raycast/api` types (MIT) so a tree produced by an
 * extension and a tree produced by a built-in command render through the same
 * frontend components.
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** Raycast `Color` enum values. The frontend maps them to theme tokens. */
export type NamedColor =
  | "raycast-blue"
  | "raycast-green"
  | "raycast-magenta"
  | "raycast-orange"
  | "raycast-purple"
  | "raycast-red"
  | "raycast-yellow"
  | "raycast-primary-text"
  | "raycast-secondary-text";

/** `Color.Dynamic` */
export interface DynamicColor {
  light: string;
  dark: string;
  adjustContrast?: boolean;
}

/** Any CSS color string, a named theme color, or a light/dark pair. */
export type ColorLike = NamedColor | string | DynamicColor;

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export type ImageMask = "circle" | "roundedRectangle";

/**
 * `Image.Source`: a URL (http, https, data, file), an absolute file path,
 * an extension asset name, an `Icon` enum value (e.g. "clipboard-16"),
 * a single emoji, or a light/dark pair.
 */
export type ImageSource = string | { light: string; dark: string };

export interface ImageObject {
  source: ImageSource;
  fallback?: ImageSource;
  mask?: ImageMask;
  tintColor?: ColorLike;
}

/** `{ fileIcon: path }` renders the Finder icon for the path. */
export interface FileIconImage {
  fileIcon: string;
}

/**
 * OpenCast extension: a built-in command tile. A white glyph drawn on a
 * rounded-square tile with a solid or gradient fill, like Raycast's
 * built-in command icons.
 */
export interface TileImage {
  tile: {
    /** Icon enum value or OpenCast glyph name. */
    glyph: string;
    /** One color or a [top, bottom] gradient. */
    background: string | [string, string];
    foreground?: string;
    /** Flat content tile (no gloss, 6/22 radius, larger glyph), as Raycast draws clipboard and snippet rows. */
    flat?: boolean;
  };
}

export type ImageLike = string | ImageObject | FileIconImage | TileImage;

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

export type KeyModifier = "cmd" | "ctrl" | "opt" | "shift" | "alt" | "windows";

/** Raycast `Keyboard.KeyEquivalent`: a character or a special key name. */
export type KeyEquivalent = string;

export interface KeyboardShortcut {
  modifiers: KeyModifier[];
  key: KeyEquivalent;
}

/**
 * A global hotkey recorded in settings. `key` uses the same names as
 * KeyEquivalent ("space", "a", "1", "f5", "arrowUp", ...). `keyCode` is the
 * macOS virtual key code, filled in by the native recorder.
 */
export interface Hotkey {
  modifiers: KeyModifier[];
  key: string;
  keyCode?: number;
  /** "Hyper" key, if the user binds Caps Lock to ⌃⌥⇧⌘. */
  hyper?: boolean;
}

// ---------------------------------------------------------------------------
// Generic rendered UI tree (extension views and declarative built-in views)
// ---------------------------------------------------------------------------

/**
 * A reference to a callback that lives in another process. The receiver
 * invokes it with `ext.session.dispatch({ sessionId, handlerId, args })`.
 */
export interface HandlerRef {
  $handler: string;
}

/**
 * A React element serialized by the extension runtime's reconciler.
 * `type` is the Raycast component path, e.g. "List", "List.Item",
 * "List.Item.Detail.Metadata.Label", "ActionPanel", "Action.CopyToClipboard",
 * "Form.TextField", "MenuBarExtra.Item".
 * Function props are replaced by HandlerRef. React elements passed as props
 * (`actions`, `detail`, `searchBarAccessory`, `metadata`) are serialized as
 * UINode values.
 */
export interface UINode {
  type: string;
  /** React key or a runtime-assigned stable id. */
  id: string;
  props: Record<string, unknown>;
  children: UINode[];
}

export type ToastStyle = "animated" | "success" | "failure";

export interface ToastState {
  id: string;
  style: ToastStyle;
  title: string;
  message?: string;
  primaryAction?: { title: string; shortcut?: KeyboardShortcut; handler?: HandlerRef };
  secondaryAction?: { title: string; shortcut?: KeyboardShortcut; handler?: HandlerRef };
}

export interface AlertOptions {
  title: string;
  message?: string;
  icon?: ImageLike;
  primaryAction?: { title: string; style?: "default" | "destructive" | "cancel" };
  dismissAction?: { title: string; style?: "default" | "destructive" | "cancel" };
  rememberUserChoice?: boolean;
}
