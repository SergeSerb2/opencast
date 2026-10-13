import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { useShallow } from "zustand/react/shallow";
import { getEnv } from "../bridge/env";
import { useSetting } from "../bridge/settings";
import { ActionPanelPopover, FloatingToastHost, ProgressiveBlur, ScrollArea, showFailureToast } from "../components";
import type { ActionModel, ActionPanelModel } from "../components";
import { buildNotesActions, findAction, runAction } from "./actions";
import { BrowseNotes } from "./components/BrowseNotes";
import { FindBar } from "./components/FindBar";
import { LinkPopover, openHref } from "./components/LinkPopover";
import { NotesFooter } from "./components/NotesFooter";
import { NotesHeader } from "./components/NotesHeader";
import { NotesController } from "./controller";
import { takeInitialRoute } from "./early-route";
import { CodeBlockView } from "./editor/CodeBlockView";
import { createNoteExtensions } from "./editor/extensions";
import { useEditorSelector } from "./hooks/useEditorSelector";
import { useAlwaysOnTop, useAutoSize, useNotesEvents, useNotesKeyboard, useWindowHover } from "./hooks/useNotesWindow";
import { useNotesPreferences } from "./lib/preferences";
import { clampZoom } from "./lib/zoom";
import { closePanel, openPanel, useNotesStore } from "./store";
import "./editor/editor.css";
import "./notes.css";

const HEADER_HEIGHT = 52;
/** Footer reservation: 44pt on macOS 26, 48pt on macOS 27 (§7.1). */
const FOOTER_HEIGHT = getEnv().macOSMajor >= 27 ? 48 : 44;
const SCROLL_BOTTOM = FOOTER_HEIGHT + 8;
/** Find panel height pushes the content down while it is open. */
const FIND_OFFSET = 48;

/** ⌘K panel anchor: under the header's glass group, right-aligned with it. */
const ACTIONS_ANCHOR = (root: DOMRect) => ({ x: root.width - 8, y: 46 });

export function NotesApp() {
  const [controller] = useState(() => new NotesController());
  const contentRef = useRef<HTMLDivElement>(null);
  const zoom = clampZoom(useSetting("notes.zoom"));
  const alwaysOnTop = useSetting("notes.alwaysOnTop");
  const formatBarVisible = useNotesPreferences((state) => state.formatBarVisible);
  const autoSize = useNotesPreferences((state) => state.autoSize);
  const { note, title, empty, panel, findOpen, canGoBack, canGoForward } = useNotesStore(
    useShallow((state) => ({ note: state.note, title: state.title, empty: state.empty, panel: state.panel, findOpen: state.findOpen, canGoBack: state.canGoBack, canGoForward: state.canGoForward })),
  );
  const hovered = useWindowHover();

  const extensions = useMemo(
    () =>
      createNoteExtensions({
        codeBlockView: ReactNodeViewRenderer(CodeBlockView),
        onLinkShortcut: () => useNotesStore.setState({ linkEditing: true }),
      }),
    [],
  );
  const editor = useEditor({
    extensions,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "tiptap", spellcheck: "true", "aria-label": "Note", "aria-multiline": "true" },
      scrollMargin: { top: HEADER_HEIGHT + 16, bottom: 100, left: 0, right: 0 },
      scrollThreshold: { top: HEADER_HEIGHT + 16, bottom: 100, left: 0, right: 0 },
      handleClick(view, pos, event) {
        // ⌘-click opens links; a plain click places the caret for editing.
        if (!event.metaKey) return false;
        const link = view.state.doc
          .resolve(pos)
          .marks()
          .find((mark) => mark.type.name === "link");
        if (!link?.attrs.href) return false;
        void openHref(String(link.attrs.href));
        return true;
      },
    },
    onUpdate: () => controller.handleUpdate(),
    onSelectionUpdate: () => controller.handleSelection(),
    onBlur: () => controller.handleBlur(),
  });

  useEffect(() => {
    controller.attachEditor(editor);
    return () => controller.attachEditor(null);
  }, [controller, editor]);

  useEffect(() => {
    void controller.boot(takeInitialRoute()).catch((error: unknown) => showFailureToast("Could not load notes", error));
  }, [controller]);

  const { hasSelection, inList } = useEditorSelector(editor, (current) => ({ hasSelection: !current.state.selection.empty, inList: current.isActive("listItem") || current.isActive("taskItem") }), {
    hasSelection: false,
    inList: false,
  });

  const model = useMemo(
    () => buildNotesActions({ controller, editor, state: { note, empty, canGoBack, canGoForward }, hasSelection, inList, formatBarVisible, autoSize, alwaysOnTop, zoom }),
    [controller, editor, note, empty, canGoBack, canGoForward, hasSelection, inList, formatBarVisible, autoSize, alwaysOnTop, zoom],
  );
  const panelModel = useMemo<ActionPanelModel | null>(() => {
    if (panel?.kind !== "actions") return null;
    const submenu = panel.submenu ? findAction(model, panel.submenu) : undefined;
    return submenu?.submenu ? { title: submenu.title, sections: submenu.submenu.sections } : model;
  }, [panel, model]);

  useNotesEvents(controller);
  useNotesKeyboard(controller, model);
  useAlwaysOnTop();
  useAutoSize(contentRef, HEADER_HEIGHT + SCROLL_BOTTOM + (findOpen ? FIND_OFFSET : 0));

  const closeActions = () => {
    closePanel();
    if (!useNotesStore.getState().findOpen && !useNotesStore.getState().linkEditing) controller.focus();
  };
  const runPanelAction = (action: ActionModel) => {
    closeActions();
    void runAction(action);
  };

  // Clicks in the empty area below the text continue the note at its end.
  const onEditorAreaMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!editor || (event.target as HTMLElement).closest(".tiptap")) return;
    event.preventDefault();
    controller.focus("end");
  };

  const style = { "--notes-scroll-bottom": `${SCROLL_BOTTOM}px` } as CSSProperties;
  return (
    <div className="sc-notes" data-hovered={hovered || undefined} data-find-open={findOpen || undefined} style={style}>
      <div className="sc-notes__editor-area" onMouseDown={onEditorAreaMouseDown}>
        <ScrollArea
          className="sc-notes__scroll"
          fade={{ top: HEADER_HEIGHT + 32, bottom: FOOTER_HEIGHT + 28 }}
          fadeMinOpacity={{ top: 0.15, bottom: 0.25 }}
          thumbInset={{ top: HEADER_HEIGHT, bottom: SCROLL_BOTTOM }}
        >
          <div ref={contentRef} className="sc-notes__content">
            <EditorContent editor={editor} className="sc-notes-editor" style={{ "--notes-zoom": zoom } as CSSProperties} />
          </div>
        </ScrollArea>
        <ProgressiveBlur height={HEADER_HEIGHT} />
      </div>
      <NotesHeader
        title={title}
        actionsOpen={panel?.kind === "actions"}
        browseOpen={panel?.kind === "browse"}
        onActions={() => (panel?.kind === "actions" ? closeActions() : openPanel({ kind: "actions" }))}
        onBrowse={() => (panel?.kind === "browse" ? closePanel() : openPanel({ kind: "browse" }))}
        onCreate={() => void controller.newNote()}
      />
      {editor && <FindBar editor={editor} />}
      <NotesFooter editor={editor} />
      {editor && <LinkPopover editor={editor} />}
      <BrowseNotes controller={controller} />
      <ActionPanelPopover model={panelModel} open={panelModel !== null} onClose={closeActions} onRun={runPanelAction} anchor={ACTIONS_ANCHOR} side="bottom" align="end" />
      <FloatingToastHost />
    </div>
  );
}
