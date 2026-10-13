import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { AIChat, AIChatFolder, AIMessage, BackendParams, ModelRef } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { getEnv } from "../../bridge/env";
import { useBackend, useLatest, useNativeEvent } from "../../bridge/hooks";
import { native } from "../../bridge/native";
import { getSetting, setSetting, useSetting } from "../../bridge/settings";
import { ActionPanelPopover } from "../../components/ActionPanel/ActionPanelPopover";
import { actionsWithShortcuts, type ActionModel, type ActionPanelModel } from "../../components/actions/model";
import { IconButton } from "../../components/Button/Button";
import { confirmAlert } from "../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import type { PopoverAnchor } from "../../components/Popover/Popover";
import { ProgressiveBlur } from "../../components/SearchBar/ProgressiveBlur";
import { FloatingToastHost } from "../../components/Toast/InlineToast";
import { SurgecastLogo } from "../../icons/glyphs";
import { matchesShortcut, sc } from "../../lib/keyboard";
import { AddMenu } from "../composer/AddMenu";
import { attachmentFromPath, textAttachment } from "../composer/attachments";
import { Composer, EMPTY_DRAFT, type ComposerDraft, type ComposerHandle } from "../composer/Composer";
import { ModelPicker } from "../components/ModelPicker";
import { copyText } from "../lib/clipboard";
import { flattenGroups, groupChats } from "../model/chat-groups";
import { modelName, resolveModelRef } from "../model/models";
import { Sidebar } from "../sidebar/Sidebar";
import { draftContent, startSend, type ChatSetup } from "../state/send";
import { useStreams } from "../state/streams";
import { useAIResources } from "../state/useAIResources";
import { useChatSession } from "../state/useChatSession";
import { Transcript } from "../transcript/Transcript";
import { buildChatActions, type ChatActionHandlers } from "./chat-actions";
import { ChatHeader } from "./ChatHeader";
import { ChatSettingsPane } from "./ChatSettingsPane";
import { DevTrafficLights } from "./DevTrafficLights";
import { NoProvider } from "./NoProvider";
import { useChatRoutes } from "./useChatRoutes";
import "./ai-chat.css";

const SIDEBAR_WIDTH = 280;
const SETTINGS_WIDTH = 300;
/** Width kept for the conversation before sidebars switch to overlays (§6.2). */
const MIN_CHAT_WIDTH = 400;
const SIDEBAR_KEY = "surgecast.ai.sidebarOpen";
const NEW_KEY = "new";

type ActionsTarget = { anchor: PopoverAnchor; side: "top" | "bottom"; align: "start" | "end"; chat: AIChat | null; model?: ActionPanelModel };

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function download(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function lastAssistant(session: ReturnType<typeof useChatSession>): AIMessage | undefined {
  for (let i = session.transcript.length - 1; i >= 0; i--) {
    const item = session.transcript[i];
    if (item.kind === "message" && item.message.role === "assistant") return item.message;
  }
  return undefined;
}

/** The AI Chat window (ai-chat.html): history sidebar, conversation, composer, header controls. */
export function AIChatApp() {
  const env = getEnv();
  const { models, modelsReady, modelsError, retryModels, toolsets, commands, presets } = useAIResources();
  const chatModelSetting = useSetting("ai.chatModel");
  const sendKey = useSetting("ai.sendMessage");
  const history = useSetting("ai.conversationHistory");
  const folders = useSetting("ai.chatFolders");
  const width = useWindowWidth();
  const zoom = useSetting("general.uiZoom");
  const headerHeight = Math.round((env.macOSMajor >= 27 ? 52 : 44) * zoom);

  const [newChatVersion, setNewChatVersion] = useState(0);
  const draftRevision = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setup, setSetup] = useState<ChatSetup>({});
  const [drafts, setDrafts] = useState<Record<string, ComposerDraft>>({});
  const [sidebarOpen, setSidebarOpen] = useState(() => (() => { try { return globalThis.localStorage?.getItem(SIDEBAR_KEY) !== "false"; } catch { return true; } })());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [actionsTarget, setActionsTarget] = useState<ActionsTarget | null>(null);
  const [modelAnchor, setModelAnchor] = useState<HTMLElement | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [folderPanel, setFolderPanel] = useState<{ anchor: PopoverAnchor; model: ActionPanelModel } | null>(null);
  /** A prompt handed over by the launcher, sent once the new chat is selected. */
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const search = useRef<HTMLInputElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(44);

  const source = history === "separate" ? "chat" : undefined;
  const chatList = useBackend("ai.chats.list", { includeArchived: true, source });
  const debouncedQuery = useDebounced(query.trim(), 150);
  const searchList = useBackend("ai.chats.list", { query: debouncedQuery, includeArchived: true, source }, undefined, { enabled: debouncedQuery.length > 0 });
  const chats = chatList.data ?? [];
  const groups = useMemo(() => groupChats(chats, folders, Date.now()), [chats, folders]);

  const session = useChatSession(selectedId, setSelectedId, newChatVersion);
  const chat = session.chat;
  const streams = useStreams((s) => s.streams);
  const generatingIds = useMemo(() => new Set(Object.values(streams).flatMap((s) => (s.status === "streaming" && s.chatId ? [s.chatId] : []))), [streams]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(SIDEBAR_KEY, String(sidebarOpen));
    } catch {
      // Remembering the sidebar is optional.
    }
  }, [sidebarOpen]);

  // A chat deleted elsewhere: fall back to a new chat.
  useEffect(() => {
    if (session.missing) setSelectedId(null);
  }, [session.missing]);

  // Clearance under the composer follows its measured height (it grows with text and attachments).
  useEffect(() => {
    const el = footer.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setFooterHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const effective: ChatSetup = chat
    ? { model: chat.model, presetId: chat.presetId, webSearch: chat.webSearch, creativity: chat.creativity, tools: chat.tools, systemInstructions: chat.systemInstructions, reasoningEffort: chat.reasoningEffort, folderId: chat.folderId }
    : setup;
  const model = resolveModelRef(models, effective.model, presets.find((preset) => preset.id === effective.presetId)?.model, chatModelSetting);
  const noProvider = modelsReady && models.length === 0;
  const draftKey = selectedId ?? NEW_KEY;
  const draft = drafts[draftKey] ?? EMPTY_DRAFT;
  const setDraft = useCallback((next: ComposerDraft) => setDrafts((all) => ({ ...all, [draftKey]: next })), [draftKey]);
  const presetName = presets.find((p) => p.id === effective.presetId)?.name;

  // Layout: inline sidebars while the conversation keeps 400px, overlays otherwise.
  const sidebarInline = width >= (SIDEBAR_WIDTH + MIN_CHAT_WIDTH) * zoom;
  const sidebarOffset = sidebarOpen && sidebarInline ? SIDEBAR_WIDTH * zoom : 0;
  const settingsInline = width >= sidebarOffset + (SETTINGS_WIDTH + MIN_CHAT_WIDTH) * zoom;

  const focusComposer = useCallback(() => requestAnimationFrame(() => composer.current?.focus()), []);

  const newChat = useCallback(
    (init: ChatSetup = {}) => {
      draftRevision.current++;
      setNewChatVersion((version) => version + 1);
      setSelectedId(null);
      setSetup(init);
      setDrafts((all) => ({ ...all, [NEW_KEY]: EMPTY_DRAFT }));
      setRenamingId(null);
      focusComposer();
    },
    [focusComposer],
  );

  const renamingRef = useLatest(renamingId);
  const selectChat = useCallback(
    (target: AIChat) => {
      setSelectedId(target.id);
      setRenamingId(null);
      // A double-click renames instead: don't pull focus out of the rename field.
      requestAnimationFrame(() => !renamingRef.current && composer.current?.focus());
    },
    [renamingRef],
  );

  // The backend announces every chat change (`ai.chats.changed`); the list and the open chat refetch on it.
  const updateChat = useCallback(async (id: string, patch: BackendParams<"ai.chats.update">["patch"]) => {
    try {
      await backend.call("ai.chats.update", { id, patch });
    } catch (error) {
      showFailureToast("Could not update chat", error);
    }
  }, []);

  const changeSetup = useCallback(
    (patch: ChatSetup) => {
      if (chat) {
        const normalized = { ...patch, ...(patch.presetId === undefined && "presetId" in patch ? { presetId: "" } : {}) };
        void updateChat(chat.id, normalized);
      } else setSetup((current) => ({ ...current, ...patch }));
    },
    [chat, updateChat],
  );

  // ---- sending ----------------------------------------------------------------------------
  const send = async (submitted: ComposerDraft) => {
    const revision = draftRevision.current;
    let content: string;
    try {
      content = await draftContent(submitted);
    } catch (error) {
      showFailureToast("Can’t run command", error);
      return;
    }
    const key = draftKey;
    setDrafts((all) => ({ ...all, [key]: EMPTY_DRAFT }));
    const started = await session.run({ content, attachments: submitted.attachments }, () =>
      startSend({ content, draft: submitted, chat, source: "chat", model, setup: chat ? undefined : { ...setup, model }, toolsets }),
    );
    if (!started && revision === draftRevision.current) setDrafts((all) => ({ ...all, [key]: submitted }));
  };

  useEffect(() => {
    if (queuedPrompt === null || selectedId !== null || session.chatId !== null) return;
    setQueuedPrompt(null);
    void send({ text: queuedPrompt, attachments: [] });
  });

  const regenerate = (message: AIMessage, withModel?: ModelRef) => {
    if (!chat) return;
    void session.run(null, async () => {
      const result = await backend.call("ai.chats.send", { chatId: chat.id, content: "", regenerateMessageId: message.id, model: withModel });
      return { streamId: result.streamId, chatId: chat.id, assistantMessageId: result.assistantMessageId };
    });
  };

  const edit = (message: AIMessage, content: string) => {
    if (!chat) return;
    void session.run(null, async () => {
      const result = await backend.call("ai.chats.send", { chatId: chat.id, content, editMessageId: message.id });
      return { streamId: result.streamId, chatId: chat.id, assistantMessageId: result.assistantMessageId };
    });
  };

  const copyMessage = async (message: AIMessage) => {
    await copyText(message.content);
    showToast({ style: "success", title: "Copied to Clipboard" });
  };

  const openPreferences = () => void native.call("window.show", { kind: "settings", route: "ai" }).catch((error: unknown) => showFailureToast("Could not open Settings", error));

  // ---- chat management ---------------------------------------------------------------------
  const deleteChat = async (target: AIChat) => {
    if (getSetting("ai.deleteChatWarning")) {
      const confirmed = await confirmAlert({ title: "Delete Chat?", message: `“${target.title}” and all of its messages will be deleted. This can’t be undone.`, primaryAction: { title: "Delete", style: "destructive" } });
      if (!confirmed) return;
    }
    const order = flattenGroups(groups);
    const index = order.findIndex((c) => c.id === target.id);
    const neighbour = order[index + 1] ?? order[index - 1];
    try {
      await backend.call("ai.chats.delete", { id: target.id });
      if (target.id === selectedId) {
        if (neighbour) selectChat(neighbour);
        else newChat();
      }
    } catch (error) {
      showFailureToast("Could not delete chat", error);
    }
  };

  const exportChat = async (target: AIChat, mode: "copy" | "download") => {
    try {
      const { content, fileName } = await backend.call("ai.chats.export", { id: target.id, format: "markdown" });
      if (mode === "copy") {
        await copyText(content);
        showToast({ style: "success", title: "Copied Chat to Clipboard" });
      } else download(fileName, content);
    } catch (error) {
      showFailureToast("Could not export chat", error);
    }
  };

  const continueInNewChat = async (target: AIChat) => {
    try {
      const { content } = await backend.call("ai.chats.export", { id: target.id, format: "markdown" });
      newChat({ model: target.model, presetId: target.presetId, folderId: target.folderId });
      setDrafts((all) => ({ ...all, [NEW_KEY]: { text: "", attachments: [textAttachment(`${target.title}.md`, content)] } }));
    } catch (error) {
      showFailureToast("Could not continue chat", error);
    }
  };

  const saveFolders = async (next: AIChatFolder[]): Promise<boolean> => {
    try {
      await setSetting("ai.chatFolders", next);
      return true;
    } catch (error) {
      showFailureToast("Could not save folders", error);
      return false;
    }
  };

  const newFolder = async (moveChat?: AIChat) => {
    const folder: AIChatFolder = { id: crypto.randomUUID(), name: "New Folder", createdAt: Date.now() };
    if (!await saveFolders([...folders, folder])) return;
    if (moveChat) void updateChat(moveChat.id, { folderId: folder.id });
    setSidebarOpen(true);
    setRenamingId(`folder:${folder.id}`);
  };

  const deleteFolder = async (folder: AIChatFolder) => {
    const inside = chats.filter((c) => c.folderId === folder.id);
    const confirmed = await confirmAlert({ title: "Delete Folder?", message: inside.length ? `The ${inside.length === 1 ? "chat" : `${inside.length} chats`} in “${folder.name}” will move back to Recent.` : `“${folder.name}” will be deleted.`, primaryAction: { title: "Delete", style: "destructive" } });
    if (!confirmed) return;
    try {
      await Promise.all(inside.map((c) => backend.call("ai.chats.update", { id: c.id, patch: { folderId: "" } })));
      await saveFolders(folders.filter((f) => f.id !== folder.id));
    } catch (error) {
      showFailureToast("Could not move chats out of folder", error);
    }
  };

  const searchChats = (query?: string) => {
    if (query !== undefined) setQuery(query);
    setSidebarOpen(true);
    requestAnimationFrame(() => search.current?.focus());
  };

  const handlersFor = (target: AIChat | null): ChatActionHandlers => ({
    newChat: () => newChat(),
    newFolder: () => newFolder(target ?? undefined),
    searchChats: () => searchChats(),
    toggleSidebar: () => setSidebarOpen((open) => !open),
    toggleSettings: () => setSettingsOpen((open) => !open),
    openPreferences,
    copyChat: () => target && void exportChat(target, "copy"),
    copyLastResponse: () => {
      const message = lastAssistant(session);
      if (message) void copyMessage(message);
    },
    exportChat: () => target && void exportChat(target, "download"),
    continueInNewChat: () => target && void continueInNewChat(target),
    rename: () => {
      if (!target) return;
      setSidebarOpen(true);
      setRenamingId(target.id);
    },
    togglePin: () => target && void updateChat(target.id, { pinned: !target.pinned }),
    moveToFolder: (folderId) => target && void updateChat(target.id, { folderId: folderId ?? "" }),
    toggleArchive: () => target && void updateChat(target.id, { archived: !target.archived }),
    deleteChat: () => target && void deleteChat(target),
    changeModel: (ref) => (target ? void updateChat(target.id, { model: ref }) : setSetup((s) => ({ ...s, model: ref }))),
    setCreativity: (creativity) => (target ? void updateChat(target.id, { creativity }) : setSetup((s) => ({ ...s, creativity }))),
    toggleWebSearch: () => (target ? void updateChat(target.id, { webSearch: !target.webSearch }) : setSetup((s) => ({ ...s, webSearch: !s.webSearch }))),
    regenerate: () => {
      const message = lastAssistant(session);
      if (message) regenerate(message);
    },
    stop: session.stop,
  });

  const actionContext = (target: AIChat | null) => ({
    chat: target,
    folders,
    models,
    model: target ? resolveModelRef(models, target.model, chatModelSetting) : model,
    creativity: target ? target.creativity : setup.creativity,
    webSearch: target ? target.webSearch : setup.webSearch,
    hasResponse: target?.id === chat?.id && Boolean(lastAssistant(session)),
    isGenerating: target?.id === chat?.id && session.isGenerating,
    sidebarOpen,
    settingsOpen,
  });

  const actions = buildChatActions(actionContext(chat), handlersFor(chat));
  const panelModel = actionsTarget ? actionsTarget.model ?? (actionsTarget.chat?.id === chat?.id ? actions : buildChatActions(actionContext(actionsTarget.chat), handlersFor(actionsTarget.chat))) : null;

  // ---- keyboard ----------------------------------------------------------------------------
  const actionsRef = useLatest(actions);
  const panelOpen = Boolean(actionsTarget || modelAnchor || addAnchor);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && getSetting("keyboard.escapeKeyClosesWindow") &&
        !document.querySelector(".sc-popover, [role=dialog]") && !event.isComposing) {
        event.preventDefault();
        void native.call("window.hide", { kind: "ai-chat" }).catch(() => undefined);
        return;
      }
      if (event.defaultPrevented || event.isComposing) return;
      if (matchesShortcut(event, sc("cmd", "k"))) {
        event.preventDefault();
        setActionsTarget((current) => (current ? null : { anchor: (root) => ({ x: root.width - 8, y: headerHeight }), side: "bottom", align: "end", chat }));
        return;
      }
      if (panelOpen) return;
      // Typing anywhere outside a text field goes to the composer.
      const target = event.target as HTMLElement | null;
      const editable = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (!editable && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        composer.current?.focus();
        return;
      }
      if (matchesShortcut(event, sc("shift", "cmd", "s")) || matchesShortcut(event, sc("cmd", "p"))) {
        event.preventDefault();
        if (matchesShortcut(event, sc("cmd", "p"))) handlersFor(chat).searchChats();
        else setSidebarOpen((open) => !open);
        return;
      }
      if (matchesShortcut(event, sc("shift", "cmd", "a"))) {
        event.preventDefault();
        setAddAnchor(footer.current?.querySelector<HTMLElement>(".sc-ai-composer") ?? null);
        return;
      }
      for (const action of actionsWithShortcuts(actionsRef.current)) {
        if (action.shortcut && !action.disabled && matchesShortcut(event, action.shortcut)) {
          if (action.id === "copy-response" && window.getSelection()?.toString()) return;
          event.preventDefault();
          if (action.id === "model") setModelAnchor(document.querySelector<HTMLElement>(".sc-ai-header__meta-button"));
          else if (action.submenu) setActionsTarget({ anchor: (root) => ({ x: root.width - 8, y: headerHeight }), side: "bottom", align: "end", chat, model: { title: action.title, sections: action.submenu.sections } });
          else void action.onAction?.();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const runAction = (action: ActionModel) => {
    setActionsTarget(null);
    Promise.resolve()
      .then(() => action.onAction?.())
      .catch((error: unknown) => showFailureToast(`${action.title} failed`, error));
  };

  // ---- routes (deeplinks, launcher hand-offs) and window lifecycle -----------------------
  useChatRoutes({
    searchChats,
    openChat: (id) => {
      setSelectedId(id);
      focusComposer();
    },
    newChat,
    insertText: (text) => composer.current?.insert(text),
    addAttachment: (path) => setDraft({ ...draft, attachments: [...draft.attachments, attachmentFromPath(path)] }),
    sendPrompt: (prompt, presetId) => {
      newChat({ presetId });
      setQueuedPrompt(prompt);
    },
    isBusy: () => session.isGenerating,
  });

  useNativeEvent("window.didShow", (event) => {
    if (event.kind === "ai-chat") focusComposer();
  });

  const openRowMenu = (target: AIChat, event: MouseEvent) => setActionsTarget({ anchor: { x: event.clientX, y: event.clientY }, side: "bottom", align: "start", chat: target });

  const folderMenu = (folder: AIChatFolder, event: MouseEvent) => {
    setActionsTarget(null);
    const panel: ActionPanelModel = {
      title: folder.name,
      sections: [
        {
          actions: [
            { id: "new-chat", title: "New Chat in Folder", icon: "pencil-square-16", onAction: () => newChat({ folderId: folder.id }) },
            { id: "rename", title: "Rename Folder", icon: "pencil-16", onAction: () => setRenamingId(`folder:${folder.id}`) },
            { id: "delete", title: "Delete Folder", icon: "trash-16", style: "destructive", onAction: () => void deleteFolder(folder) },
          ],
        },
      ],
    };
    setFolderPanel({ anchor: { x: event.clientX, y: event.clientY }, model: panel });
  };

  const startDrag = (event: MouseEvent) => {
    if (env.native && event.target === event.currentTarget && event.button === 0) void native.call("window.startDrag", { kind: "ai-chat" }).catch(() => undefined);
  };

  const style = {
    "--ai-sidebar-offset": `${sidebarOffset}px`,
    "--ai-settings-offset": settingsOpen && settingsInline ? `${SETTINGS_WIDTH * zoom}px` : "0px",
    "--ai-sidebar-width": `${SIDEBAR_WIDTH * zoom}px`,
    "--ai-bottom-clearance": `${footerHeight + 8 + 16}px`,
  } as CSSProperties;

  const readOnly = Boolean(chat?.archived);

  return (
    <div className="sc-ai-window" style={style} data-sidebar={sidebarOpen ? (sidebarInline ? "inline" : "overlay") : undefined}>
      {sidebarOpen && (
        <Sidebar
          ref={search}
          groups={groups}
          results={debouncedQuery ? (searchList.data ?? null) : null}
          query={query}
          onQueryChange={setQuery}
          selectedId={selectedId}
          draftActive={selectedId === null && !query}
          generatingIds={generatingIds}
          renamingId={renamingId}
          onRenamingChange={setRenamingId}
          onSelect={selectChat}
          onSelectDraft={focusComposer}
          onRename={(target, title) => void updateChat(target.id, { title })}
          onRenameFolder={(folder, name) => saveFolders(folders.map((f) => (f.id === folder.id ? { ...f, name } : f)))}
          onChatContextMenu={openRowMenu}
          onFolderContextMenu={folderMenu}
          onSearchKeyDown={(event) => {
            const list = debouncedQuery ? (searchList.data ?? []) : flattenGroups(groups);
            if (event.key === "Escape") {
              event.preventDefault();
              if (query) setQuery("");
              else focusComposer();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const index = list.findIndex((c) => c.id === selectedId);
              const next = list[event.key === "ArrowDown" ? index + 1 : Math.max(0, index - 1)] ?? list[0];
              if (next) setSelectedId(next.id);
            } else if (event.key === "Enter") {
              event.preventDefault();
              focusComposer();
            }
          }}
        />
      )}

      <main className="sc-ai-main">
        <div className="sc-ai-main__content">
          {noProvider && !session.transcript.length ? (
            <NoProvider onOpenSettings={openPreferences} error={modelsError} onRetry={retryModels} />
          ) : (
            <Transcript
              topFade={headerHeight + 16}
              session={session}
              variant="chat"
              models={models}
              toolsets={toolsets}
              readOnly={readOnly || noProvider}
              empty={<SurgecastLogo size={70} className="sc-ai-watermark" />}
              onCopy={(message) => void copyMessage(message)}
              onEdit={edit}
              onRegenerate={regenerate}
              onOpenSettings={openPreferences}
            />
          )}
        </div>
        <ProgressiveBlur height={60} />
        <div className="sc-ai-header-drag" onMouseDown={startDrag}>
          <ChatHeader
            title={chat?.title ?? "New Chat"}
            isNew={!chat || chat.title === "New Chat"}
            modelLabel={models.length ? modelName(models, model) : "No Model"}
            presetName={presetName}
            canRename={Boolean(chat)}
            onRename={(title) => chat && void updateChat(chat.id, { title })}
            onOpenModels={setModelAnchor}
            onOpenActions={(anchor) => setActionsTarget(actionsTarget ? null : { anchor, side: "bottom", align: "end", chat })}
            onToggleSettings={() => setSettingsOpen((open) => !open)}
            settingsOpen={settingsOpen}
            actionsOpen={Boolean(actionsTarget)}
          />
        </div>
        <div ref={footer} className="sc-ai-footer">
          <div className="sc-ai-footer__inner">
          {readOnly && chat ? (
            <div className="sc-ai-archived sc-glass-control">
              <span>This chat is archived.</span>
              <button type="button" onClick={() => void updateChat(chat.id, { archived: false })}>
                Unarchive
              </button>
            </div>
          ) : (
            <Composer
              key={`${draftKey}:${newChatVersion}`}
              ref={composer}
              variant="chat"
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={(d) => void send(d)}
              onStop={session.stop}
              isGenerating={session.isGenerating}
              disabled={noProvider}
              toolsets={toolsets}
              commands={commands}
              presets={presets}
              onPickPreset={(preset) => changeSetup({ presetId: preset.id, model: preset.model ?? model, creativity: preset.creativity, webSearch: preset.webSearch, tools: preset.tools })}
              sendKey={sendKey}
              autoFocus
              leading={<IconButton icon="plus-16" iconSize={20} size={28} label="Add Context (⇧⌘A)" data-state={addAnchor ? "open" : undefined} disabled={noProvider} onClick={(e) => setAddAnchor(addAnchor ? null : (e.currentTarget.closest(".sc-ai-composer") as HTMLElement))} />}
            />
          )}
          </div>
        </div>
      </main>

      {settingsOpen && (
        <ChatSettingsPane setup={{ ...effective, model }} onChange={changeSetup} models={models} presets={presets} toolsets={toolsets} onClose={() => setSettingsOpen(false)} overlay={!settingsInline} />
      )}

      <div className="sc-ai-window-controls" onMouseDown={startDrag}>
        {!env.native && <DevTrafficLights />}
        <IconButton icon="app-window-sidebar-left-16" iconSize={18} size={36} variant="glass" className="sc-ai-sidebar-toggle" label={sidebarOpen ? "Hide Chat History (⌘B)" : "Show Chat History (⌘B)"} onClick={() => setSidebarOpen((open) => !open)} />
        <div className="sc-ai-glass-group sc-glass-control sc-ai-new-group" data-sidebar={sidebarOpen || undefined}>
          {sidebarOpen && <IconButton icon="new-folder-16" iconSize={18} size={28} label="New Folder (⌃⌘N)" onClick={() => newFolder()} />}
          <IconButton icon="pencil-square-16" iconSize={18} size={28} label="New Chat (⌘N)" onClick={() => newChat()} />
        </div>
      </div>

      <ModelPicker open={Boolean(modelAnchor)} anchor={modelAnchor} onClose={() => setModelAnchor(null)} models={models} value={model} onPick={(ref) => handlersFor(chat).changeModel(ref)} />
      <AddMenu open={Boolean(addAnchor)} anchor={addAnchor} onClose={() => setAddAnchor(null)} windowKind="ai-chat" onAdd={(added) => setDraft({ ...draft, attachments: [...draft.attachments, ...added] })} />
      <ActionPanelPopover model={panelModel} open={Boolean(actionsTarget)} onClose={() => setActionsTarget(null)} onRun={runAction} anchor={actionsTarget?.anchor} side={actionsTarget?.side} align={actionsTarget?.align} />
      <ActionPanelPopover model={folderPanel?.model ?? null} open={Boolean(folderPanel)} onClose={() => setFolderPanel(null)} onRun={(action) => (setFolderPanel(null), runAction(action))} anchor={folderPanel?.anchor} side="bottom" align="start" />
      <FloatingToastHost />
    </div>
  );
}
