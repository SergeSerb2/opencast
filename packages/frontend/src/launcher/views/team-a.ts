/**
 * Content views: clipboard history, snippets, quicklinks, emoji, file search,
 * notes search and calculator history.
 */
import { createElement } from "react";
import type { Quicklink, Snippet } from "@opencast/protocol";
import { CalculatorHistoryView } from "./calculator-history/CalculatorHistoryView";
import { ClipboardHistoryView } from "./clipboard-history/ClipboardHistoryView";
import { EmojiView } from "./emoji/EmojiView";
import { FileSearchView } from "./file-search/FileSearchView";
import { ExportView, ImportView } from "./library/ImportExportViews";
import { NotesSearchView } from "./notes-search/NotesSearchView";
import { QuicklinkFormView } from "./quicklinks/QuicklinkFormView";
import { QuicklinksSearchView } from "./quicklinks/QuicklinksSearchView";
import { registerView, type LauncherViewProps } from "./registry";
import { SnippetFormView } from "./snippets/SnippetFormView";
import { SnippetsSearchView } from "./snippets/SnippetsSearchView";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : typeof value === "string" ? [value] : undefined);

registerView("clipboard-history", ClipboardHistoryView);
registerView("snippets.search", SnippetsSearchView);
registerView("snippets.create", ({ props, icon }: LauncherViewProps<{ snippet?: Snippet; text?: string; query?: string }>) =>
  createElement(SnippetFormView, { snippet: props.snippet, initial: props.snippet ? undefined : { text: text(props.text) ?? text(props.query) }, navigationIcon: icon }),
);
registerView("snippets.import", ({ props, title, icon }: LauncherViewProps<{ json?: unknown }>) => createElement(ImportView, { kind: "snippets", pending: strings(props.json), title, icon }));
registerView("snippets.export", ({ title, icon }: LauncherViewProps) => createElement(ExportView, { kind: "snippets", title, icon }));
registerView("quicklinks.search", QuicklinksSearchView);
registerView("quicklinks.create", ({ props, icon }: LauncherViewProps<{ quicklink?: Quicklink; link?: string; name?: string; query?: string }>) =>
  createElement(QuicklinkFormView, { quicklink: props.quicklink, initial: props.quicklink ? undefined : { link: text(props.link) ?? text(props.query), name: text(props.name) }, navigationIcon: icon }),
);
registerView("quicklinks.import", ({ props, title, icon }: LauncherViewProps<{ json?: unknown }>) => createElement(ImportView, { kind: "quicklinks", pending: strings(props.json), title, icon }));
registerView("quicklinks.export", ({ title, icon }: LauncherViewProps) => createElement(ExportView, { kind: "quicklinks", title, icon }));
registerView("emoji", EmojiView);
registerView("file-search", FileSearchView);
registerView("notes.search", NotesSearchView);
// The backend opens Calculator History as "calculator-history".
registerView("calculator-history", CalculatorHistoryView);
registerView("calculator.history", CalculatorHistoryView);
