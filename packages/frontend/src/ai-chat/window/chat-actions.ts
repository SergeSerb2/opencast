import type { AIChat, AIChatFolder, AIModelOption, Creativity, ModelRef } from "@surgecast/protocol";
import type { ActionModel, ActionPanelModel } from "../../components/actions/model";
import { sc } from "../../lib/keyboard";
import { groupByProvider } from "../model/models";

export interface ChatActionHandlers {
  newChat: () => void;
  newFolder: () => void;
  searchChats: () => void;
  toggleSidebar: () => void;
  toggleSettings: () => void;
  openPreferences: () => void;
  copyChat: () => void;
  copyLastResponse: () => void;
  exportChat: () => void;
  continueInNewChat: () => void;
  rename: () => void;
  togglePin: () => void;
  moveToFolder: (folderId: string | undefined) => void;
  toggleArchive: () => void;
  deleteChat: () => void;
  changeModel: (ref: ModelRef) => void;
  setCreativity: (value: Creativity) => void;
  toggleWebSearch: () => void;
  regenerate: () => void;
  stop: () => void;
}

export interface ChatActionContext {
  /** Null while the chat is an unsaved draft. */
  chat: AIChat | null;
  folders: readonly AIChatFolder[];
  models: readonly AIModelOption[];
  model?: ModelRef;
  creativity?: Creativity;
  webSearch?: boolean;
  hasResponse: boolean;
  isGenerating: boolean;
  sidebarOpen: boolean;
  settingsOpen: boolean;
}

const CREATIVITY: { value: Creativity; title: string }[] = [
  { value: "none", title: "None" },
  { value: "low", title: "Low" },
  { value: "medium", title: "Medium" },
  { value: "high", title: "High" },
  { value: "maximum", title: "Maximum" },
];

/** The AI Chat window's ⌘K panel (also the row context menu) for the current chat. */
export function buildChatActions(context: ChatActionContext, h: ChatActionHandlers): ActionPanelModel {
  const { chat } = context;
  const response: ActionModel[] = [];
  if (context.isGenerating) response.push({ id: "stop", title: "Stop Response", icon: "stop-16", shortcut: sc("cmd", "."), onAction: h.stop });
  if (context.hasResponse && !context.isGenerating && !chat?.archived) response.push({ id: "regenerate", title: "Regenerate Response", icon: "arrow-clockwise-16", shortcut: sc("cmd", "r"), onAction: h.regenerate });
  if (context.hasResponse) response.push({ id: "copy-response", title: "Copy Last Response", icon: "copy-clipboard-16", shortcut: sc("shift", "cmd", "c"), onAction: h.copyLastResponse });

  const chatActions: ActionModel[] = [{ id: "new-chat", title: "New Chat", icon: "pencil-square-16", shortcut: sc("cmd", "n"), onAction: h.newChat }];
  if (chat) {
    chatActions.push(
      { id: "copy-chat", title: "Copy Chat", icon: "copy-clipboard-16", shortcut: sc("opt", "shift", "cmd", "c"), onAction: h.copyChat },
      { id: "export", title: "Export as Markdown", icon: "download-16", shortcut: sc("shift", "cmd", "e"), onAction: h.exportChat },
      { id: "continue", title: "Continue in New Chat", icon: "branch-16", shortcut: sc("shift", "cmd", "b"), onAction: h.continueInNewChat },
      { id: "rename", title: "Rename Chat", icon: "pencil-16", shortcut: sc("ctrl", "cmd", "r"), onAction: h.rename },
      { id: "pin", title: chat.pinned ? "Unpin Chat" : "Pin Chat", icon: chat.pinned ? "pin-disabled-16" : "pin-16", shortcut: sc("shift", "cmd", "p"), onAction: h.togglePin },
      {
        id: "move",
        title: "Move to Folder",
        icon: "folder-16",
        shortcut: sc("ctrl", "cmd", "m"),
        submenu: {
          searchPlaceholder: "Search folders…",
          sections: [
            {
              actions: [
                ...context.folders.map((folder) => ({ id: `folder:${folder.id}`, title: folder.name, icon: chat.folderId === folder.id ? "checkmark-16" : "folder-16", onAction: () => h.moveToFolder(folder.id) })),
                { id: "folder:new", title: "New Folder…", icon: "new-folder-16", onAction: h.newFolder },
                ...(chat.folderId ? [{ id: "folder:none", title: "Remove from Folder", icon: "xmark-16", onAction: () => h.moveToFolder(undefined) }] : []),
              ],
            },
          ],
        },
      },
      { id: "archive", title: chat.archived ? "Unarchive Chat" : "Archive Chat", icon: chat.archived ? "unarchive-16" : "archive-16", shortcut: sc("opt", "cmd", "a"), onAction: h.toggleArchive },
      { id: "delete", title: "Delete Chat", icon: "trash-16", style: "destructive", shortcut: sc("ctrl", "x"), onAction: h.deleteChat },
    );
  }

  const settings: ActionModel[] = [];
  if (context.models.length) {
    settings.push({
      id: "model",
      title: "Change Model",
      icon: "stars-16",
      shortcut: sc("shift", "cmd", "m"),
      submenu: {
        searchPlaceholder: "Search models…",
        sections: groupByProvider(context.models).map((group) => ({
          title: group.providerName,
          actions: group.models.map((model) => ({ id: `model:${model.ref}`, title: model.name, icon: model.ref === context.model ? "checkmark-16" : undefined, keywords: [model.modelId], onAction: () => h.changeModel(model.ref) })),
        })),
      },
    });
  }
  settings.push(
    {
      id: "creativity",
      title: "Creativity",
      icon: "light-bulb-16",
      shortcut: sc("shift", "cmd", "y"),
      submenu: { sections: [{ actions: CREATIVITY.map((c) => ({ id: `creativity:${c.value}`, title: c.title, icon: (context.creativity ?? "medium") === c.value ? "checkmark-16" : undefined, onAction: () => h.setCreativity(c.value) })) }] },
    },
    { id: "web-search", title: context.webSearch ? "Turn Off Web Search" : "Turn On Web Search", icon: "globe-01-16", onAction: h.toggleWebSearch },
    { id: "chat-settings", title: context.settingsOpen ? "Hide Chat Settings" : "Show Chat Settings", icon: "settings-slider-16", shortcut: sc("opt", "cmd", "s"), onAction: h.toggleSettings },
  );

  const window: ActionModel[] = [
    { id: "search", title: "Search Chats", icon: "magnifying-glass-16", shortcut: sc("cmd", "f"), onAction: h.searchChats },
    { id: "sidebar", title: context.sidebarOpen ? "Hide Chat History" : "Show Chat History", icon: "app-window-sidebar-left-16", shortcut: sc("cmd", "b"), onAction: h.toggleSidebar },
    { id: "new-folder", title: "New Folder", icon: "new-folder-16", shortcut: sc("ctrl", "cmd", "n"), onAction: h.newFolder },
    { id: "preferences", title: "AI Settings…", icon: "cog-16", shortcut: sc("cmd", ","), onAction: h.openPreferences },
  ];

  return {
    title: chat?.title ?? "New Chat",
    sections: [{ actions: response }, { actions: chatActions }, { title: "Chat Settings", actions: settings }, { title: "Window", actions: window }].filter((s) => s.actions.length > 0),
  };
}
