import { useEffect, useRef } from "react";
import { backend } from "../../bridge/backend";
import { useLatest, useNativeEvent } from "../../bridge/hooks";
import { getSetting } from "../../bridge/settings";
import { showFailureToast } from "../../components/feedback/toast-store";
import type { ChatSetup } from "../state/send";

export interface ChatRouteHandlers {
  openChat: (chatId: string) => void;
  newChat: (setup?: ChatSetup) => void;
  insertText: (text: string) => void;
  addAttachment: (path: string) => void;
  sendPrompt: (prompt: string, presetId?: string) => void;
  /** A response is streaming in the open chat (don't reset it on reopen). */
  isBusy: () => boolean;
}

/** Route payloads: deeplink query parameters or the launcher's AI hand-off. */
interface RoutePayload {
  text?: string;
  filepath?: string;
  prompt?: string;
  presetId?: string;
  aiCommandId?: string;
  arguments?: Record<string, string>;
}

export type ChatRoute =
  | { kind: "none" }
  | { kind: "new"; presetId?: string }
  | { kind: "chat"; chatId: string }
  | { kind: "text"; text: string }
  | { kind: "attachment"; path: string }
  | { kind: "prompt"; prompt: string; presetId?: string }
  | { kind: "command"; commandId: string; arguments?: Record<string, string> };

/**
 * Interpret a `window.route` for the AI Chat window:
 * "new", "add-text"/"append-text" (?text), "add-attachment" (?filepath),
 * a chat id (optionally "chat/<id>"), or a launcher payload { prompt, presetId, aiCommandId }.
 */
export function parseChatRoute(route: string | undefined, payload: unknown): ChatRoute {
  const input = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const data: RoutePayload = {};
  for (const key of ["text", "filepath", "prompt", "presetId", "aiCommandId"] as const) {
    if (typeof input[key] === "string") data[key] = input[key];
  }
  if (input.arguments && typeof input.arguments === "object" && !Array.isArray(input.arguments)) {
    data.arguments = Object.fromEntries(Object.entries(input.arguments).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  }
  let path: string;
  try { path = decodeURIComponent(route ?? "").replace(/^\/+|\/+$/g, "").replace(/^ai-chat\//, ""); }
  catch { return { kind: "none" }; }
  if (path === "add-text" || path === "append-text") return data.text?.trim() ? { kind: "text", text: data.text } : { kind: "none" };
  if (path === "add-attachment") return data.filepath ? { kind: "attachment", path: data.filepath } : { kind: "none" };
  if (path === "new") return { kind: "new", presetId: data.presetId };
  if (path) return { kind: "chat", chatId: path.replace(/^chat\//, "") };
  if (data.aiCommandId) return { kind: "command", commandId: data.aiCommandId, arguments: data.arguments };
  if (data.prompt?.trim()) return { kind: "prompt", prompt: data.prompt.trim(), presetId: data.presetId };
  if (data.presetId) return { kind: "new", presetId: data.presetId };
  return { kind: "none" };
}

function durationMs(value: string): number | null {
  if (value === "never") return null;
  if (value === "immediately") return 0;
  const match = /^(\d+(?:\.\d+)?)(s|m|h|d)$/.exec(value);
  return match ? Number(match[1]) * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"] : null;
}

/** Window routes (deeplinks, launcher hand-offs) and “start a new chat after N minutes away”. */
export function useChatRoutes(handlers: ChatRouteHandlers): void {
  const latest = useLatest(handlers);
  const hiddenAt = useRef<number | null>(null);

  const apply = (route: ChatRoute) => {
    const h = latest.current;
    switch (route.kind) {
      case "new":
        h.newChat(route.presetId ? { presetId: route.presetId } : {});
        break;
      case "chat":
        h.openChat(route.chatId);
        break;
      case "text":
        h.insertText(route.text);
        break;
      case "attachment":
        h.addAttachment(route.path);
        break;
      case "prompt":
        h.sendPrompt(route.prompt, route.presetId);
        break;
      case "command":
        backend
          .call("ai.commands.run", { id: route.commandId, arguments: route.arguments })
          .then(({ chatId }) => chatId && latest.current.openChat(chatId))
          .catch((error: unknown) => showFailureToast("Could not run AI command", error));
        break;
      case "none":
        break;
    }
  };

  // In a browser, other windows open this page with the route in the hash.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) apply(parseChatRoute(hash, Object.fromEntries(new URLSearchParams(window.location.search))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on load
  }, []);

  useNativeEvent("window.route", (event) => {
    if (event.kind === "ai-chat") apply(parseChatRoute(event.route, event.payload));
  });
  useNativeEvent("window.didHide", (event) => {
    if (event.kind === "ai-chat") hiddenAt.current = Date.now();
  });
  useNativeEvent("window.didShow", (event) => {
    if (event.kind !== "ai-chat" || hiddenAt.current === null) return;
    const away = Date.now() - hiddenAt.current;
    hiddenAt.current = null;
    const limit = durationMs(getSetting("ai.startNewChat"));
    if (limit !== null && away >= limit && !latest.current.isBusy()) latest.current.newChat();
  });
}
