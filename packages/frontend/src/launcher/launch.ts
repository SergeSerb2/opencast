import type { CommandId, CommandInfo, ImageLike, LaunchResult } from "@surgecast/protocol";
import { backend } from "../bridge/backend";
import { errorMessage } from "../bridge/errors";
import { native } from "../bridge/native";
import { showHUD } from "../components/feedback/hud";
import { showToast } from "../components/feedback/toast-store";
import { useNavigationStore } from "./navigation";

export interface LaunchOptions {
  arguments?: Record<string, string>;
  fallbackText?: string;
  launchContext?: Record<string, unknown>;
  source?: "root" | "hotkey" | "deeplink" | "fallback" | "alias";
  /** Shown in the footer of a pushed view. */
  title?: string;
  icon?: ImageLike;
  /** Replace the top view instead of pushing (relaunch after preferences). */
  replace?: boolean;
}

/** Hide the launcher; the next show resets per `launcher.popToRootTimeout`. */
export function hideLauncher(): void {
  void native.call("window.hide", { kind: "main", restoreFocus: true }).catch(() => undefined);
}

/** Apply a `LaunchResult` from the backend to the launcher (push, hide, HUD, toast). */
export function handleLaunchResult(result: LaunchResult, options: Pick<LaunchOptions, "title" | "icon" | "replace" | "arguments"> & { commandId?: CommandId } = {}): void {
  const nav = useNavigationStore.getState();
  const place = options.replace ? nav.replaceTop : nav.push;
  switch (result.kind) {
    case "view":
      place({ kind: "builtin", view: result.view, title: result.view.title ?? options.title, icon: options.icon, commandId: options.commandId });
      return;
    case "extension":
      if (result.mode === "view") place({ kind: "extension", sessionId: result.sessionId, title: options.title, icon: options.icon, commandId: options.commandId });
      else hideLauncher();
      return;
    case "ai":
      if (result.target === "chat") {
        void native.call("window.show", { kind: "ai-chat", payload: { prompt: result.prompt, presetId: result.presetId, aiCommandId: result.aiCommandId } }).catch(() => undefined);
        hideLauncher();
      } else {
        // AI Commands resolve their {argument} placeholders from the values typed in root search.
        place({ kind: "quick-ai", prompt: result.prompt, aiCommandId: result.aiCommandId, presetId: result.presetId, arguments: result.aiCommandId ? options.arguments : undefined, title: options.title ?? "Quick AI", icon: options.icon, commandId: options.commandId });
      }
      return;
    case "done":
      if (result.popToRoot) nav.popToRoot({ clearSearch: true });
      if (result.hud) void showHUD(result.hud);
      else if (result.closeWindow) hideLauncher();
      return;
    case "error":
      showToast({ style: "failure", title: "Failed to run command", message: result.message });
      return;
  }
}

/** Run a command through `commands.launch` and route the result. */
export async function launchCommand(id: CommandId, options: LaunchOptions = {}): Promise<void> {
  try {
    const result = await backend.call("commands.launch", {
      id,
      arguments: options.arguments,
      fallbackText: options.fallbackText,
      launchContext: options.launchContext,
      source: options.source,
    });
    handleLaunchResult(result, { ...options, commandId: id });
  } catch (error) {
    showToast({ style: "failure", title: "Failed to run command", message: errorMessage(error) });
  }
}

/** Launch from a command row: the footer shows the command's title and icon. */
export function launchCommandInfo(command: Pick<CommandInfo, "id" | "title" | "icon">, options: LaunchOptions = {}): Promise<void> {
  return launchCommand(command.id, { title: command.title, icon: command.icon, ...options });
}
