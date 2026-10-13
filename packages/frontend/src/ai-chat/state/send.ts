import type { AIChat, AICommand, ModelRef } from "@opencast/protocol";
import { backend } from "../../bridge/backend";
import { native } from "../../bridge/native";
import { applyCommandPrompt, placeholderKinds } from "../model/command-prompt";
import { mentionedToolsets, type Toolset } from "../model/mentions";
import type { ComposerDraft } from "../composer/Composer";
import type { StartedStream } from "./useChatSession";

/** Settings chosen for a chat before it exists (draft chats are created on first send). */
export type ChatSetup = Partial<Pick<AIChat, "presetId" | "model" | "webSearch" | "creativity" | "tools" | "systemInstructions" | "reasoningEffort" | "folderId">>;

async function readClipboardText(): Promise<string | undefined> {
  try {
    const snapshot = await native.call("clipboard.read");
    if (snapshot) return snapshot.primary.kind === "text" ? snapshot.primary.text : snapshot.text;
  } catch {
    // Fall through to the web clipboard outside the app.
  }
  return navigator.clipboard?.readText().catch(() => undefined);
}

/** Expand an AI Command picked from the `/` menu around the typed text. */
export async function commandMessage(command: AICommand, input: string): Promise<string> {
  const kinds = placeholderKinds(command.prompt);
  const clipboard = kinds.includes("clipboard") ? await readClipboardText() : undefined;
  const focusedApp = kinds.includes("focused-app") ? ((await native.call("apps.previous").catch(() => null))?.name ?? undefined) : undefined;
  const result = applyCommandPrompt(command.prompt, { input, clipboard, focusedApp, now: new Date() });
  if (!result.ok) {
    const what = result.unsupported.map((k) => (k === "browser-tab" ? "the browser tab" : k)).join(" and ");
    throw new Error(`“${command.name}” needs ${what}, which AI Chat can’t resolve. Run it from the launcher instead.`);
  }
  return result.prompt;
}

/** The text that will be sent for a draft (the expanded command prompt when one is attached). */
export async function draftContent(draft: ComposerDraft): Promise<string> {
  return draft.command ? commandMessage(draft.command, draft.text.trim()) : draft.text.trim();
}

/** Enable the toolsets of any `@mentions` on the chat; the backend activates tools per chat. */
async function enableMentionedTools(chat: AIChat, content: string, toolsets: readonly Toolset[]): Promise<void> {
  const wanted = mentionedToolsets(content, toolsets).map((t) => t.id);
  const current = chat.tools ?? [];
  const missing = wanted.filter((id) => !current.includes(id));
  if (missing.length) await backend.call("ai.chats.update", { id: chat.id, patch: { tools: [...current, ...missing] } });
}

export interface SendRequest {
  content: string;
  draft: ComposerDraft;
  chat: AIChat | null;
  /** Chat source when the chat has to be created. */
  source: "chat" | "quick-ai";
  model?: ModelRef;
  setup?: ChatSetup;
  toolsets: readonly Toolset[];
}

/**
 * Create the chat if needed, enable mentioned tools, and start the response.
 * AI Chat sends with `ai.chats.send`; Quick AI asks with `ai.ask` on its chat.
 */
export async function startSend({ content, draft, chat, source, model, setup, toolsets }: SendRequest): Promise<StartedStream> {
  let target = chat;
  if (!target) {
    target = await backend.call("ai.chats.create", { source, model: model ?? setup?.model, presetId: setup?.presetId });
    const { presetId: _preset, model: _model, ...patch } = setup ?? {};
    if (Object.keys(patch).length) target = await backend.call("ai.chats.update", { id: target.id, patch });
  }
  await enableMentionedTools(target, content, toolsets);
  if (source === "quick-ai") {
    const { streamId } = await backend.call("ai.ask", { prompt: content, chatId: target.id, model, attachments: draft.attachments.length ? draft.attachments : undefined });
    return { streamId, chatId: target.id };
  }
  const result = await backend.call("ai.chats.send", { chatId: target.id, content, attachments: draft.attachments.length ? draft.attachments : undefined, model: model && model !== target.model ? model : undefined });
  return { streamId: result.streamId, chatId: target.id, assistantMessageId: result.assistantMessageId };
}
