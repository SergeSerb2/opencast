import type { ReactNode } from "react";
import type { ClipboardContent, ImageLike, KeyboardShortcut } from "@surgecast/protocol";
import { pasteTitle } from "../../bridge/frontmost-app";
import { native } from "../../bridge/native";
import { showHUD } from "../feedback/hud";
import { showFailureToast } from "../feedback/toast-store";
import { BaseAction, defineAction, type ActionProps } from "./ActionPanel";
import type { ActionStyle } from "./model";

interface CommonProps {
  id?: string;
  title?: string;
  icon?: ImageLike;
  shortcut?: KeyboardShortcut;
  style?: ActionStyle;
}

function toClipboardContent(content: string | number | ClipboardContent): ClipboardContent {
  return typeof content === "object" ? content : { kind: "text", text: String(content) };
}

async function guarded(title: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    showFailureToast(title, error);
  }
}

export interface CopyToClipboardProps extends CommonProps {
  content: string | number | ClipboardContent;
  concealed?: boolean;
  transient?: boolean;
  onCopy?: () => void;
}

const CopyToClipboard = defineAction<CopyToClipboardProps>("Action.CopyToClipboard", (p) => ({
  id: p.id ?? "copy-to-clipboard",
  title: p.title ?? "Copy to Clipboard",
  icon: p.icon ?? "copy-clipboard-16",
  shortcut: p.shortcut,
  style: p.style,
  onAction: () =>
    guarded("Failed to copy", async () => {
      await native.call("clipboard.write", { content: toClipboardContent(p.content), concealed: p.concealed, transient: p.transient });
      p.onCopy?.();
      await showHUD("Copied to Clipboard");
    }),
}));

export interface PasteProps extends CommonProps {
  content: string | number | ClipboardContent;
  onPaste?: () => void;
}

const Paste = defineAction<PasteProps>("Action.Paste", (p) => ({
  id: p.id ?? "paste",
  title: p.title ?? pasteTitle(),
  icon: p.icon ?? "clipboard-16",
  shortcut: p.shortcut,
  style: p.style,
  onAction: () =>
    guarded("Failed to paste", async () => {
      await native.call("input.paste", { content: toClipboardContent(p.content) });
      p.onPaste?.();
    }),
}));

export interface OpenInBrowserProps extends CommonProps {
  url: string;
  onOpen?: () => void;
}

const OpenInBrowser = defineAction<OpenInBrowserProps>("Action.OpenInBrowser", (p) => ({
  id: p.id ?? "open-in-browser",
  title: p.title ?? "Open in Browser",
  icon: p.icon ?? "globe-01-16",
  shortcut: p.shortcut,
  style: p.style,
  onAction: () =>
    guarded("Failed to open", async () => {
      await native.call("open.url", { url: p.url });
      p.onOpen?.();
      await native.call("window.hide", { kind: "main" });
    }),
}));

export interface OpenProps extends CommonProps {
  title: string;
  target: string;
  /** Bundle id or path of the app to open with. */
  application?: string;
  onOpen?: () => void;
}

const Open = defineAction<OpenProps>("Action.Open", (p) => ({
  id: p.id ?? `open:${p.target}`,
  title: p.title,
  icon: p.icon ?? "finder-16",
  shortcut: p.shortcut,
  style: p.style,
  onAction: () =>
    guarded("Failed to open", async () => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(p.target)) await native.call("open.url", { url: p.target, app: p.application });
      else await native.call("open.path", { path: p.target, app: p.application });
      p.onOpen?.();
      await native.call("window.hide", { kind: "main" });
    }),
}));

export interface ShowInFinderProps extends CommonProps {
  path: string;
  onShow?: () => void;
}

const ShowInFinder = defineAction<ShowInFinderProps>("Action.ShowInFinder", (p) => ({
  id: p.id ?? "show-in-finder",
  title: p.title ?? "Show in Finder",
  icon: p.icon ?? "finder-16",
  shortcut: p.shortcut,
  style: p.style,
  onAction: () =>
    guarded("Failed to show in Finder", async () => {
      await native.call("open.showInFinder", { path: p.path });
      p.onShow?.();
      await native.call("window.hide", { kind: "main" });
    }),
}));

export interface TrashProps extends CommonProps {
  paths: string | string[];
  onTrash?: () => void;
}

const Trash = defineAction<TrashProps>("Action.Trash", (p) => ({
  id: p.id ?? "trash",
  title: p.title ?? "Move to Trash",
  icon: p.icon ?? "trash-16",
  shortcut: p.shortcut,
  style: p.style ?? "destructive",
  onAction: () =>
    guarded("Failed to move to Trash", async () => {
      await native.call("open.trash", { paths: Array.isArray(p.paths) ? p.paths : [p.paths] });
      p.onTrash?.();
    }),
}));

export interface PushProps extends CommonProps {
  title: string;
  target: ReactNode;
  onPush?: () => void;
}

const Push = defineAction<PushProps>("Action.Push", (p, context) => ({
  id: p.id ?? `push:${p.title}`,
  title: p.title,
  icon: p.icon,
  shortcut: p.shortcut,
  style: p.style,
  onAction: () => {
    context.push(p.target);
    p.onPush?.();
  },
}));

export interface SubmitFormProps extends CommonProps {
  onSubmit: (values: Record<string, unknown>) => unknown;
}

const SubmitForm = defineAction<SubmitFormProps>("Action.SubmitForm", (p, context) => ({
  id: p.id ?? "submit-form",
  title: p.title ?? "Submit Form",
  icon: p.icon ?? "checkmark-16",
  shortcut: p.shortcut,
  style: p.style,
  onAction: () => p.onSubmit(context.getFormValues() ?? {}),
}));

type ActionNamespace = typeof BaseAction & {
  CopyToClipboard: typeof CopyToClipboard;
  Paste: typeof Paste;
  OpenInBrowser: typeof OpenInBrowser;
  Open: typeof Open;
  ShowInFinder: typeof ShowInFinder;
  Trash: typeof Trash;
  Push: typeof Push;
  SubmitForm: typeof SubmitForm;
};

/** `<Action>` and the built-in kinds (`<Action.CopyToClipboard>`, `<Action.Push>`, …). */
export const Action = Object.assign(BaseAction, { CopyToClipboard, Paste, OpenInBrowser, Open, ShowInFinder, Trash, Push, SubmitForm }) as ActionNamespace;
export type { ActionProps };
