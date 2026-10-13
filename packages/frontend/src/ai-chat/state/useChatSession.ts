import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AIAttachment, AIChat, AIMessage } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { errorMessage, isCancelled } from "../../bridge/errors";
import { useEvent, useLatest } from "../../bridge/hooks";
import { showFailureToast } from "../../components/feedback/toast-store";
import { branchInfo, buildMessageTree, resolveLeaf, visibleBranch, type BranchInfo, type MessageTree } from "../model/message-tree";
import { withLiveStream, type LiveStream } from "../model/stream";
import { installStreamListener, registerStream, streamsForChat, useStreams } from "./streams";

export type TranscriptItem =
  | { kind: "message"; message: AIMessage; branch: BranchInfo; live?: LiveStream; isLast: boolean }
  | { kind: "pending"; content: string; attachments: AIAttachment[] };

/** What a send call returned: enough to follow the stream before the chat is refetched. */
export interface StartedStream {
  streamId: string;
  chatId: string;
  assistantMessageId?: string;
}

export interface ChatSession {
  chatId: string | null;
  chat: AIChat | null;
  tree: MessageTree;
  transcript: TranscriptItem[];
  isLoading: boolean;
  /** The stream currently writing to this chat. */
  activeStream: LiveStream | undefined;
  /** A response is being generated (also when another window started it). */
  isGenerating: boolean;
  /** The chat disappeared (deleted elsewhere). */
  missing: boolean;
  refetch: () => Promise<void>;
  /** Show the optimistic user message, run `start`, then follow the stream it returns. */
  run: (pending: { content: string; attachments: AIAttachment[] } | null, start: () => Promise<StartedStream>) => Promise<StartedStream | null>;
  selectLeaf: (leafId: string) => void;
  stop: () => void;
  confirmTool: (callId: string, approved: boolean, always?: boolean) => void;
}

const EMPTY: AIMessage[] = [];

/**
 * One chat's transcript: stored messages (all branches) from `ai.chats.get`
 * merged with live `ai.stream` state. `chatId` null is an unsaved draft; a
 * send that creates the chat reports it through `onChatCreated`.
 */
export function useChatSession(chatId: string | null, onChatCreated?: (chatId: string) => void): ChatSession {
  installStreamListener();
  const [currentId, setCurrentId] = useState<string | null>(chatId);
  const [chat, setChat] = useState<AIChat | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>(EMPTY);
  const [isLoading, setLoading] = useState(Boolean(chatId));
  const [missing, setMissing] = useState(false);
  const [pending, setPending] = useState<{ content: string; attachments: AIAttachment[] } | null>(null);
  const [leafOverride, setLeafOverride] = useState<string | null>(null);
  const [requestedId, setRequestedId] = useState<string | null>(chatId);
  // Read by async callbacks; updated synchronously whenever `currentId` changes.
  const idRef = useRef<string | null>(currentId);
  const request = useRef<AbortController | null>(null);
  const onCreated = useLatest(onChatCreated);

  // The caller switched chats. A chat this session created itself is already current.
  if (chatId !== requestedId) {
    setRequestedId(chatId);
    if (chatId !== currentId) {
      idRef.current = chatId;
      setCurrentId(chatId);
      setChat(null);
      setMessages(EMPTY);
      setPending(null);
      setLeafOverride(null);
      setMissing(false);
      setLoading(Boolean(chatId));
    }
  }

  const refetch = useCallback(async () => {
    const id = idRef.current;
    request.current?.abort();
    if (!id) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await backend.call("ai.chats.get", { id }, { signal: controller.signal });
      if (controller.signal.aborted || idRef.current !== id) return;
      setChat(result?.chat ?? null);
      setMessages(result?.messages ?? EMPTY);
      setMissing(result === null);
      setLeafOverride((override) => (override && result?.chat.currentLeafId === override ? null : override));
    } catch (error) {
      if (!isCancelled(error) && !controller.signal.aborted) showFailureToast("Could not load chat", error);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refetch();
    return () => request.current?.abort();
  }, [currentId, refetch]);

  useEvent("ai.chats.changed", (event) => {
    if (event.chatId === idRef.current) void refetch();
  });
  useEvent("entities.changed", (event) => {
    if (event.collection === "aiMessages" && event.source === "sync" && idRef.current) void refetch();
  });
  useEffect(() => backend.onStateChange((state) => state === "open" && void refetch()), [refetch]);

  const streams = useStreams((s) => s.streams);
  const chatStreams = useMemo(() => streamsForChat(streams, currentId ?? undefined), [streams, currentId]);
  const activeStream = chatStreams.find((s) => s.status === "streaming");

  // Refetch once a stream for this chat finishes so the stored message replaces the live copy.
  const finished = chatStreams.filter((s) => s.status !== "streaming").map((s) => s.streamId).join(",");
  useEffect(() => {
    if (finished) void refetch();
  }, [finished, refetch]);

  const tree = useMemo(() => buildMessageTree(messages), [messages]);
  const leaf = resolveLeaf(tree, leafOverride ?? chat?.currentLeafId);
  const branch = useMemo(() => visibleBranch(tree, leaf), [tree, leaf]);

  // A response another window is generating: poll the stored copy until it settles.
  const lastMessage = branch[branch.length - 1];
  const foreignStreaming = lastMessage?.status === "streaming" && !chatStreams.some((s) => s.messageId === lastMessage.id && s.status === "streaming");
  useEffect(() => {
    if (!foreignStreaming) return;
    const timer = setInterval(() => void refetch(), 400);
    return () => clearInterval(timer);
  }, [foreignStreaming, refetch]);

  const transcript = useMemo<TranscriptItem[]>(() => {
    const items: TranscriptItem[] = branch.map((message, index) => {
      const live = chatStreams.find((s) => s.messageId === message.id);
      return { kind: "message", message: withLiveStream(message, live), branch: branchInfo(tree, message), live, isLast: index === branch.length - 1 && !pending };
    });
    if (pending) items.push({ kind: "pending", content: pending.content, attachments: pending.attachments });
    return items;
  }, [branch, chatStreams, tree, pending]);

  const run = useCallback<ChatSession["run"]>(
    async (optimistic, start) => {
      setPending(optimistic);
      try {
        const started = await start();
        registerStream(started.streamId, { chatId: started.chatId, messageId: started.assistantMessageId });
        if (started.chatId !== idRef.current) {
          idRef.current = started.chatId;
          setCurrentId(started.chatId);
          onCreated.current?.(started.chatId);
        }
        await refetch();
        return started;
      } catch (error) {
        showFailureToast("Could not send message", error);
        return null;
      } finally {
        setPending(null);
      }
    },
    [onCreated, refetch],
  );

  const selectLeaf = useCallback(
    (leafId: string) => {
      const id = idRef.current;
      if (!id) return;
      setLeafOverride(leafId);
      backend.call("ai.chats.update", { id, patch: { currentLeafId: leafId } }).catch((error: unknown) => {
        setLeafOverride(null);
        showFailureToast("Could not switch branch", error);
      });
    },
    [],
  );

  const activeRef = useLatest(activeStream);
  const stop = useCallback(() => {
    const stream = activeRef.current;
    if (stream) backend.call("ai.stop", { streamId: stream.streamId }).catch((error: unknown) => showFailureToast("Could not stop response", error));
  }, [activeRef]);

  const chatStreamsRef = useLatest(chatStreams);
  const confirmTool = useCallback(
    (callId: string, approved: boolean, always?: boolean) => {
      const stream = chatStreamsRef.current.find((s) => s.toolCalls.some((c) => c.id === callId));
      if (!stream) {
        showFailureToast("Tool confirmation unavailable", "This request was started in another window.");
        return;
      }
      backend.call("ai.confirmTool", { streamId: stream.streamId, callId, approved, always }).catch((error: unknown) => showFailureToast("Could not answer the tool request", errorMessage(error)));
    },
    [chatStreamsRef],
  );

  return {
    chatId: currentId,
    chat,
    tree,
    transcript,
    isLoading,
    activeStream,
    isGenerating: Boolean(activeStream) || foreignStreaming || Boolean(pending),
    missing,
    refetch,
    run,
    selectLeaf,
    stop,
    confirmTool,
  };
}
