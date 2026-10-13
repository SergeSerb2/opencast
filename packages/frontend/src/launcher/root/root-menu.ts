import { native } from "../../bridge/native";
import type { ActionPanelModel } from "../../components/actions/model";
import { confirmAlert } from "../../components/feedback/alert-store";
import { sc } from "../../lib/keyboard";
import { hideLauncher } from "../launch";

const showWindow = (kind: "settings" | "ai-chat" | "notes", route?: string) =>
  native
    .call("window.show", { kind, route })
    .then(hideLauncher)
    .catch(() => undefined);

/** The root search menu (left footer pill, ⇧⌘K). */
export function rootMenu(): ActionPanelModel {
  return {
    title: "Surgecast",
    sections: [
      {
        actions: [
          { id: "settings", title: "Settings", icon: "cog-16", shortcut: sc("cmd", ","), onAction: () => showWindow("settings") },
          { id: "extensions", title: "Manage Extensions", icon: "app-window-grid-2x2-16", onAction: () => showWindow("settings", "extensions") },
          { id: "ai-chat", title: "Open AI Chat", icon: "speech-bubble-16", shortcut: sc("cmd", "j"), onAction: () => showWindow("ai-chat") },
          { id: "notes", title: "Open Notes", icon: "blank-document-16", onAction: () => showWindow("notes") },
        ],
      },
      {
        actions: [
          { id: "about", title: "About Surgecast", icon: "info-01-16", onAction: () => showWindow("settings", "about") },
          { id: "docs", title: "Documentation", icon: "book-16", onAction: () => native.call("open.url", { url: "https://github.com/SergeSerb2/surgecast#readme" }).then(hideLauncher) },
          { id: "feedback", title: "Report an Issue", icon: "bug-16", onAction: () => native.call("open.url", { url: "https://github.com/SergeSerb2/surgecast/issues/new" }).then(hideLauncher) },
        ],
      },
      {
        actions: [
          {
            id: "quit",
            title: "Quit Surgecast",
            icon: "power-16",
            style: "destructive",
            shortcut: sc("cmd", "q"),
            onAction: async () => {
              if (await confirmAlert({ title: "Quit Surgecast?", message: "Hotkeys, snippets and clipboard history stop until you open it again.", primaryAction: { title: "Quit", style: "destructive" } }))
                await native.call("app.quit");
            },
          },
        ],
      },
    ],
  };
}
