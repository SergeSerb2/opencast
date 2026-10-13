import { useCallback, useEffect, useRef, useState } from "react";
import type { AIStreamEvent } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage, isCancelled } from "../../../bridge/errors";
import { useEvent } from "../../../bridge/hooks";
import { AUTO_LANGUAGE } from "./languages";
import { buildTranslationPrompt, parseTranslationOutput, translationErrorKind } from "./translation-prompt";

export type TranslationStatus = "idle" | "translating" | "done" | "error";

export interface TranslationState {
  status: TranslationStatus;
  /** Translation so far (kept while a newer request is on its way). */
  text: string;
  /** Source language the model detected (with "Detect Language"). */
  detected?: string;
  error?: string;
  errorKind?: "setup" | "auth" | "other";
  /** The source text and target the shown translation belongs to. */
  forText?: string;
  forSource?: string;
  forTarget?: string;
}

export const TYPING_DEBOUNCE_MS = 400;

const IDLE: TranslationState = { status: "idle", text: "" };

/**
 * Each translation runs in its own AI chat (titled, so the backend skips
 * generating a title) that is deleted once its stream ends, so translations
 * never show up in AI chat history. Lives outside React so streams stopped
 * by an unmounted view are cleaned up too.
 */
const pendingChats = new Map<string, string>();
let stopWatching: (() => void) | null = null;

function deleteChatWhenDone(streamId: string, chatId: string, early: AIStreamEvent[]): void {
  // A fast provider can finish before the RPC response identifies its stream.
  if (early.some((event) => event.streamId === streamId && (event.type === "done" || event.type === "error"))) {
    backend.call("ai.chats.delete", { id: chatId }).catch(() => undefined);
    return;
  }
  pendingChats.set(streamId, chatId);
  stopWatching ??= backend.on("ai.stream", (event) => {
    if (event.type !== "done" && event.type !== "error") return;
    const id = pendingChats.get(event.streamId);
    if (!id) return;
    pendingChats.delete(event.streamId);
    backend.call("ai.chats.delete", { id }).catch(() => undefined);
    if (pendingChats.size === 0) {
      stopWatching?.();
      stopWatching = null;
    }
  });
}

interface ActiveRequest {
  streamId?: string;
  raw: string;
  expectsDetection: boolean;
  text: string;
  source: string;
  target: string;
  /** Stream events that arrived before `ai.ask` returned the stream id. */
  early: AIStreamEvent[];
}

/**
 * Translates `text` with the user's AI provider: debounced while typing,
 * immediate when the languages change, streamed, and cancelled (`ai.stop`)
 * when superseded.
 */
export function useTranslation({ text, source, target, enabled }: { text: string; source: string; target: string; enabled: boolean }): TranslationState & { retry: () => void } {
  const [state, setState] = useState<TranslationState>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const active = useRef<ActiveRequest | null>(null);
  const scheduledText = useRef<string | null>(null);

  const stopActive = useCallback(() => {
    const request = active.current;
    active.current = null;
    if (request?.streamId) backend.call("ai.stop", { streamId: request.streamId }).catch(() => undefined);
  }, []);

  const handle = useCallback((request: ActiveRequest, event: AIStreamEvent) => {
    if (event.type === "text") {
      request.raw += event.delta;
      const parsed = parseTranslationOutput(request.raw, request.expectsDetection);
      if (parsed.pending) return;
      setState((previous) => ({ status: "translating", text: parsed.text, detected: parsed.detected ?? (request.expectsDetection ? previous.detected : undefined), forText: request.text, forSource: request.source, forTarget: request.target }));
    } else if (event.type === "done") {
      active.current = null;
      const parsed = parseTranslationOutput(request.raw, request.expectsDetection);
      setState((previous) => ({ status: "done", text: parsed.text, detected: parsed.detected ?? (request.expectsDetection ? previous.detected : undefined), forText: request.text, forSource: request.source, forTarget: request.target }));
    } else if (event.type === "error") {
      active.current = null;
      setState((previous) => ({ ...previous, status: "error", error: event.message, errorKind: translationErrorKind(event.message, event.status) }));
    }
  }, []);

  useEvent("ai.stream", (event) => {
    const request = active.current;
    if (!request) return;
    if (!request.streamId) {
      if (request.early.length < 1000) request.early.push(event);
      return;
    }
    if (event.streamId === request.streamId) handle(request, event);
  });

  useEffect(() => {
    if (!enabled) {
      stopActive();
      setState(IDLE);
      return;
    }
    // Only typing is debounced; the first run, language changes and retries start at once.
    const typing = scheduledText.current !== null && scheduledText.current !== text;
    scheduledText.current = text;
    if (!text.trim()) {
      stopActive();
      setState(IDLE);
      return;
    }
    if (source !== AUTO_LANGUAGE && source === target) {
      stopActive();
      setState({ status: "done", text, forText: text, forSource: source, forTarget: target });
      return;
    }

    const run = async () => {
      stopActive();
      const { system, prompt, expectsDetection } = buildTranslationPrompt({ text, source, target });
      const request: ActiveRequest = { raw: "", expectsDetection, text, source, target, early: [] };
      active.current = request;
      setState((previous) => ({ ...previous, status: "translating", detected: undefined, error: undefined, errorKind: undefined }));
      let chatId: string | undefined;
      let stopEarlyWatcher: (() => void) | undefined;
      try {
        const chat = await backend.call("ai.chats.create", { source: "quick-ai", title: "Translation" });
        chatId = chat.id;
        if (active.current !== request) {
          backend.call("ai.chats.delete", { id: chat.id }).catch(() => undefined);
          return;
        }
        // Keep terminal events even when this request was cancelled while awaiting the RPC.
        const earlyTerminal: AIStreamEvent[] = [];
        stopEarlyWatcher = backend.on("ai.stream", (event) => {
          if (event.type === "done" || event.type === "error") earlyTerminal.push(event);
        });
        const { streamId } = await backend.call("ai.ask", { chatId: chat.id, prompt, system, creativity: "none" });
        deleteChatWhenDone(streamId, chat.id, earlyTerminal);
        if (active.current !== request) {
          backend.call("ai.stop", { streamId }).catch(() => undefined);
          return;
        }
        request.streamId = streamId;
        for (const event of request.early.splice(0)) if (event.streamId === streamId && active.current === request) handle(request, event);
      } catch (error) {
        if (chatId) backend.call("ai.chats.delete", { id: chatId }).catch(() => undefined);
        if (active.current !== request || isCancelled(error)) return;
        active.current = null;
        const message = errorMessage(error);
        setState((previous) => ({ ...previous, status: "error", error: message, errorKind: translationErrorKind(message) }));
      } finally {
        stopEarlyWatcher?.();
      }
    };

    const timer = setTimeout(run, typing ? TYPING_DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      stopActive();
    };
  }, [text, source, target, enabled, attempt, stopActive, handle]);

  useEffect(() => stopActive, [stopActive]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
