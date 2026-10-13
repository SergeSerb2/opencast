import { useMemo } from "react";
import type { AIAttachment, WindowKind } from "@surgecast/protocol";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { Menu, type MenuSection } from "../../components/Menu/Menu";
import { Popover, type PopoverAnchor } from "../../components/Popover/Popover";
import { sc } from "../../lib/keyboard";
import { captureScreenshot, clipboardAttachments, pickFiles, selectedTextAttachment } from "./attachments";

export interface AddMenuProps {
  open: boolean;
  anchor: PopoverAnchor | null;
  onClose: () => void;
  onAdd: (attachments: AIAttachment[]) => void;
  /** Window to hide while capturing the screen. */
  windowKind: WindowKind;
  /** Quick AI can read the selection of the app behind the launcher. */
  includeSelectedText?: boolean;
}

type Source = "file" | "clipboard" | "selection" | "area" | "window" | "screen";

async function collect(source: Source, windowKind: WindowKind): Promise<AIAttachment[]> {
  switch (source) {
    case "file":
      return pickFiles();
    case "clipboard":
      return clipboardAttachments();
    case "selection": {
      const attachment = await selectedTextAttachment();
      return attachment ? [attachment] : [];
    }
    case "area":
    case "window":
    case "screen": {
      const attachment = await captureScreenshot(source === "area" ? "interactive" : source, windowKind);
      return attachment ? [attachment] : [];
    }
  }
}

const EMPTY_MESSAGE: Partial<Record<Source, string>> = { clipboard: "The clipboard is empty", selection: "No text is selected" };

/** “Add Context” menu: files, clipboard, selection and screenshots (350 × ≤280, above the composer). */
export function AddMenu({ open, anchor, onClose, onAdd, windowKind, includeSelectedText }: AddMenuProps) {
  const sections = useMemo<MenuSection[]>(
    () => [
      {
        id: "attach",
        items: [
          { id: "file", title: "File…", icon: "blank-document-16", shortcut: sc("shift", "cmd", "a") },
          { id: "clipboard", title: "Clipboard", icon: "copy-clipboard-16" },
          ...(includeSelectedText ? [{ id: "selection", title: "Selected Text", icon: "text-selection-16" }] : []),
        ],
      },
      {
        id: "screenshot",
        title: "Screenshot",
        items: [
          { id: "area", title: "Selected Area", icon: "crop-16" },
          { id: "window", title: "Window", icon: "app-window-16" },
          { id: "screen", title: "Entire Screen", icon: "desktop-16" },
        ],
      },
    ],
    [includeSelectedText],
  );

  const run = async (source: Source) => {
    onClose();
    try {
      const added = await collect(source, windowKind);
      if (added.length) onAdd(added);
      else if (EMPTY_MESSAGE[source]) showToast({ style: "failure", title: EMPTY_MESSAGE[source] });
    } catch (error) {
      showFailureToast("Could not add context", error);
    }
  };

  return (
    <Popover open={open} onClose={onClose} anchor={anchor} side="top" align="start" offset={8} width={350} flip={false} aria-label="Add Context" role="dialog">
      <Menu sections={sections} layout="up" searchPlaceholder="Add context…" maxHeight={280} onSelect={(item) => void run(item.id as Source)} onDismiss={onClose} aria-label="Add Context" />
    </Popover>
  );
}
