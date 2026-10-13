import type { LucideIcon } from "lucide-react";
import { Archive, ArchiveRestore, ArrowUp, Brain, CircleX, ClipboardList, Command, GitBranch, List, MessageCircle, PanelRight, Settings2, SquareArrowOutUpRight, SquarePen, Star } from "lucide-react";

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
  // AI Chat and Quick AI chrome
  "pencil-square-16": SquarePen,
  "settings-slider-16": Settings2,
  "archive-16": Archive,
  "unarchive-16": ArchiveRestore,
  "open-in-window-16": SquareArrowOutUpRight,
  "arrow-up-thick-16": ArrowUp,
  "brain-16": Brain,
  "branch-16": GitBranch,
  "speech-bubble-round-16": MessageCircle,
};

export const FILLED_ALIASES: ReadonlySet<string> = new Set(["star-filled-16"]);
