import { memo } from "react";
import type { KeyboardShortcut } from "@surgecast/protocol";
import { shortcutKeys, shortcutLabel } from "../../lib/keyboard";
import "./keycap.css";

export type KeycapSize = "small" | "medium";
export type KeycapVariant = "default" | "prominent" | "success" | "error";

export interface KeycapProps {
  children: string;
  size?: KeycapSize;
  variant?: KeycapVariant;
}

/** One key: 18px (small) or 20px (medium) tall, framed by a 1px token border. */
export const Keycap = memo(function Keycap({ children, size = "small", variant = "default" }: KeycapProps) {
  return (
    <kbd className="sc-kbd" data-size={size} data-variant={variant}>
      {children}
    </kbd>
  );
});

export interface ShortcutProps {
  shortcut: KeyboardShortcut;
  size?: KeycapSize;
  variant?: KeycapVariant;
  className?: string;
}

/** A shortcut as separate keycaps in ⌃ ⌥ ⇧ ⌘ order, then the key. */
export const Shortcut = memo(function Shortcut({ shortcut, size = "small", variant = "default", className }: ShortcutProps) {
  return (
    <span className={`sc-shortcut${className ? ` ${className}` : ""}`} aria-label={shortcutLabel(shortcut)}>
      {shortcutKeys(shortcut).map((key, index) => (
        <Keycap key={index} size={size} variant={variant}>
          {key}
        </Keycap>
      ))}
    </span>
  );
});
