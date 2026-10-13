import type { Editor } from "@tiptap/core";
import { native } from "../bridge/native";
import { setSetting } from "../bridge/settings";
import type { ActionModel, ActionPanelModel, ActionSectionModel } from "../components/actions/model";
import { showFailureToast, showToast } from "../components/feedback/toast-store";
import type { NotesController } from "./controller";
import { HEADINGS, INLINE_FORMATS, LISTS, toggleInline, toggleList } from "./components/FormatBar";
import { focusFindInput } from "./components/FindBar";
import { FORMAT_LABEL, copyNoteAs, exportNoteAs, type NoteFormat } from "./lib/note-formats";
import { copyToClipboard } from "./lib/output";
import { setNotesPreference } from "./lib/preferences";
import { NOTES_SHORTCUTS as S } from "./lib/shortcuts";
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, zoomIn, zoomOut } from "./lib/zoom";
import { closePanel, openPanel, useNotesStore, type NotesState } from "./store";

/** Deeplink that opens a note (handled by the `notes.open` command's launch context). */
export function noteDeeplink(id: string): string {
  return `surgecast://extensions/surgecast/notes/open?launchContext=${encodeURIComponent(JSON.stringify({ id }))}`;
}

export async function setNotesZoom(value: number, toastTitle?: string): Promise<void> {
  try {
    await setSetting("notes.zoom", value);
    showToast({ style: "success", title: toastTitle ?? `Zoomed to ${Math.round(value * 100)}%` });
  } catch (error) {
    showFailureToast("Could not change zoom", error);
  }
}

export interface NotesActionContext {
  controller: NotesController;
  editor: Editor | null;
  state: Pick<NotesState, "note" | "empty" | "canGoBack" | "canGoForward">;
  hasSelection: boolean;
  inList: boolean;
  formatBarVisible: boolean;
  autoSize: boolean;
  alwaysOnTop: boolean;
  zoom: number;
}

/** Markdown of the selection, for "Copy Selection As…". */
function selectionMarkdown(editor: Editor): string {
  const slice = editor.state.selection.content();
  return editor.markdown?.serialize({ type: "doc", content: slice.content.toJSON() ?? [] }) ?? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n");
}

const FORMATS: { format: NoteFormat; icon: string }[] = [
  { format: "markdown", icon: "hashtag-16" },
  { format: "html", icon: "code-16" },
  { format: "text", icon: "text-16" },
];

function formatSubmenu(ctx: NotesActionContext): ActionModel {
  const { editor } = ctx;
  const run = (fn: (editor: Editor) => void) => () => {
    if (editor) fn(editor);
  };
  return {
    id: "format",
    title: "Format…",
    icon: "text-16",
    shortcut: S.format,
    submenu: {
      searchPlaceholder: "Search for actions…",
      sections: [
        {
          title: "Inline",
          actions: [
            {
              id: "format-heading",
              title: "Heading…",
              icon: "heading-16",
              submenu: {
                sections: [
                  {
                    actions: HEADINGS.map((heading) => ({
                      id: `heading${heading.level}`,
                      title: heading.title,
                      icon: "heading-16",
                      shortcut: heading.shortcut,
                      onAction: run((e) => e.chain().focus().toggleHeading({ level: heading.level }).run()),
                    })),
                  },
                ],
              },
            },
            ...INLINE_FORMATS.map((entry) => ({ id: `format-${entry.mark}`, title: entry.title, icon: entry.icon, shortcut: entry.shortcut, onAction: run((e) => toggleInline(e, entry.mark)) })),
            { id: "format-code", title: "Code", icon: "code-16", shortcut: S.code, onAction: run((e) => e.chain().focus().toggleCode().run()) },
            { id: "format-link", title: "Link", icon: "link-16", shortcut: S.link, onAction: () => useNotesStore.setState({ linkEditing: true }) },
          ],
        },
        {
          title: "Block",
          actions: [
            { id: "format-code-block", title: "Code Block", icon: "code-block-16", shortcut: S.codeBlock, onAction: run((e) => e.chain().focus().toggleCodeBlock().run()) },
            { id: "format-blockquote", title: "Blockquote", icon: "quote-block-16", shortcut: S.blockquote, onAction: run((e) => e.chain().focus().toggleBlockquote().run()) },
          ],
        },
        {
          title: "List",
          actions: LISTS.map((entry) => ({
            id: `format-${entry.list}`,
            title: entry.title,
            icon: entry.icon,
            shortcut: entry.shortcut,
            keywords: entry.keywords,
            onAction: run((e) => toggleList(e, entry.list)),
          })),
        },
      ],
    },
  };
}

function copySubmenu(ctx: NotesActionContext): ActionModel {
  const { controller, editor, hasSelection } = ctx;
  const source = () => (hasSelection && editor ? selectionMarkdown(editor) : controller.currentMarkdown());
  return {
    id: "copy-note-as",
    title: hasSelection ? "Copy Selection As…" : "Copy Note As…",
    icon: "copy-clipboard-16",
    shortcut: S.copyAs,
    disabled: ctx.state.empty,
    submenu: {
      sections: [{ actions: FORMATS.map(({ format, icon }) => ({ id: `copy-${format}`, title: FORMAT_LABEL[format], icon, onAction: () => copyNoteAs(source(), format) })) }],
    },
  };
}

function exportSubmenu(ctx: NotesActionContext): ActionModel {
  const { controller } = ctx;
  return {
    id: "export",
    title: "Export…",
    icon: "upload-16",
    shortcut: S.export,
    disabled: ctx.state.empty,
    submenu: {
      sections: [
        {
          actions: FORMATS.map(({ format, icon }) => ({
            id: `export-${format}`,
            title: FORMAT_LABEL[format],
            icon,
            onAction: () => exportNoteAs(controller.currentTitle(), controller.currentMarkdown(), format),
          })),
        },
      ],
    },
  };
}

/** The Notes window's ⌘K panel (Raycast 2.7.3 sections and shortcuts). */
export function buildNotesActions(ctx: NotesActionContext): ActionPanelModel {
  const { controller, editor, state } = ctx;
  const noteId = state.note?.id ?? null;
  const pinned = Boolean(state.note?.pinned);
  const sections: ActionSectionModel[] = [
    {
      id: "note-management",
      actions: [
        { id: "new", title: "New Note", icon: "plus-16", shortcut: S.newNote, disabled: state.empty, onAction: () => controller.newNote() },
        { id: "duplicate", title: "Duplicate Note", icon: "duplicate-16", shortcut: S.duplicate, disabled: state.empty, onAction: () => controller.duplicate() },
        {
          id: "toggle-pin",
          title: pinned ? "Unpin Note" : "Pin Note",
          icon: pinned ? "tack-disabled-16" : "tack-16",
          shortcut: S.togglePin,
          disabled: !noteId && state.empty,
          onAction: () => controller.togglePin(),
        },
        { id: "browse", title: "Browse Notes", icon: "docs-stacked-16", shortcut: S.browse, onAction: () => openPanel({ kind: "browse" }) },
        { id: "go-back", title: "Go Back", icon: "arrow-left-circle-16", shortcut: S.back, disabled: !state.canGoBack, onAction: () => controller.back() },
        { id: "go-forward", title: "Go Forward", icon: "arrow-right-circle-16", shortcut: S.forward, disabled: !state.canGoForward, onAction: () => controller.forward() },
      ],
    },
    {
      id: "copy-export",
      actions: [
        {
          id: "find",
          title: "Find in Note",
          icon: "magnifying-glass-16",
          shortcut: S.find,
          onAction: () => {
            if (useNotesStore.getState().findOpen) focusFindInput();
            else useNotesStore.setState({ findOpen: true });
          },
        },
        copySubmenu(ctx),
        {
          id: "copy-deeplink",
          title: "Copy Deeplink",
          icon: "copy-clipboard-16",
          shortcut: S.copyDeeplink,
          disabled: !noteId,
          onAction: async () => {
            if (!noteId) return;
            await copyToClipboard(noteDeeplink(noteId));
            showToast({ style: "success", title: "Copied Deeplink" });
          },
        },
        {
          id: "create-quicklink",
          title: "Create Quicklink",
          icon: "link-16",
          shortcut: S.createQuicklink,
          disabled: !noteId,
          onAction: async () => {
            if (!noteId) return;
            await native.call("window.show", {
              kind: "main",
              route: "command:builtin:quicklinks.createQuicklink",
              payload: { launchContext: { name: controller.currentTitle(), link: noteDeeplink(noteId) } },
            });
          },
        },
        exportSubmenu(ctx),
      ],
    },
    {
      id: "editing",
      actions: [
        { id: "move-list-item-up", title: "Move List Item Up", icon: "arrow-up-16", shortcut: S.moveItemUp, disabled: !ctx.inList, onAction: () => editor?.chain().focus().moveListItem("up").run() },
        {
          id: "move-list-item-down",
          title: "Move List Item Down",
          icon: "arrow-down-16",
          shortcut: S.moveItemDown,
          disabled: !ctx.inList,
          onAction: () => editor?.chain().focus().moveListItem("down").run(),
        },
        formatSubmenu(ctx),
      ],
    },
    {
      id: "window-settings",
      actions: [
        {
          id: "toggle-auto-sizing",
          title: ctx.autoSize ? "Disable Window Auto-Sizing" : "Enable Window Auto-Sizing",
          icon: "app-window-16",
          shortcut: S.autoSize,
          onAction: () => setNotesPreference("autoSize", !ctx.autoSize),
        },
        { id: "toggle-format-bar", title: "Toggle Format Bar", icon: "text-16", shortcut: S.formatBar, onAction: () => setNotesPreference("formatBarVisible", !ctx.formatBarVisible) },
        {
          id: "toggle-always-on-top",
          title: ctx.alwaysOnTop ? "Disable Always on Top" : "Enable Always on Top",
          icon: ctx.alwaysOnTop ? "pin-disabled-16" : "pin-16",
          shortcut: S.alwaysOnTop,
          onAction: () => setSetting("notes.alwaysOnTop", !ctx.alwaysOnTop),
        },
      ],
    },
    {
      id: "zoom",
      actions: [
        {
          id: "actual-size",
          title: "Actual Size",
          icon: "magnifying-glass-16",
          shortcut: S.zoomReset,
          disabled: ctx.zoom === ZOOM_DEFAULT,
          onAction: () => setNotesZoom(ZOOM_DEFAULT, "Zoom reset to default"),
        },
        { id: "zoom-in", title: "Zoom In", icon: "plus-circle-16", shortcut: S.zoomIn, disabled: ctx.zoom >= ZOOM_MAX, onAction: () => setNotesZoom(zoomIn(ctx.zoom)) },
        { id: "zoom-out", title: "Zoom Out", icon: "minus-circle-16", shortcut: S.zoomOut, disabled: ctx.zoom <= ZOOM_MIN, onAction: () => setNotesZoom(zoomOut(ctx.zoom)) },
      ],
    },
    {
      id: "note-settings",
      actions: [
        { id: "open-settings", title: "Open Notes Settings", icon: "cog-16", shortcut: S.settings, onAction: () => native.call("window.show", { kind: "settings", route: "extensions/notes" }) },
      ],
    },
    {
      id: "note-actions-destructive",
      actions: [
        { id: "delete", title: "Delete Note", icon: "trash-16", style: "destructive", shortcut: S.deleteNote, disabled: !noteId, onAction: () => controller.deleteNote() },
        { id: "delete-all", title: "Delete All Notes", icon: "trash-16", style: "destructive", shortcut: S.deleteAll, onAction: () => controller.deleteAll() },
      ],
    },
  ];
  return { sections };
}

/** Find an action (also inside submenus) by id. */
export function findAction(model: ActionPanelModel, id: string): ActionModel | undefined {
  for (const section of model.sections) {
    for (const action of section.actions) {
      if (action.id === id) return action;
      const nested = action.submenu && findAction({ sections: action.submenu.sections }, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** Run an action from a shortcut: submenus open the panel at that submenu. */
export async function runAction(action: ActionModel): Promise<void> {
  if (action.disabled) return;
  if (action.submenu) {
    openPanel({ kind: "actions", submenu: action.id });
    return;
  }
  closePanel();
  try {
    await action.onAction?.();
  } catch (error) {
    showFailureToast(action.title, error);
  }
}
