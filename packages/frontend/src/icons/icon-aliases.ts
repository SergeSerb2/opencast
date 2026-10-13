import type { LucideIcon } from "lucide-react";
import { CircleX, ClipboardList, Command, Files, List, PanelRight, Star } from "lucide-react";

/**
 * Glyph names Surgecast's own UI uses that are not `Icon` enum values
 * (Raycast's sprite has them as internal names).
 */
export const ICON_ALIASES: Record<string, LucideIcon> = {
  "clipboard-16": ClipboardList,
  "list-16": List,
  "sidebar-16": PanelRight,
  "star-filled-16": Star,
  "xmark-circle-16": CircleX,
  "command-symbol-20": Command,
  "docs-stacked-16": Files,
  "docs-stacked-20": Files,
};

export const FILLED_ALIASES: ReadonlySet<string> = new Set(["star-filled-16"]);
