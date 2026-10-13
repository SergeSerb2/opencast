import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { AIMessage, AIModelOption, ModelRef } from "@surgecast/protocol";
import { ScrollArea } from "../../components/ScrollArea/ScrollArea";
import type { Toolset } from "../model/mentions";
import type { ChatSession } from "../state/useChatSession";
import { AssistantMessage } from "./AssistantMessage";
import { LoadingDiamond } from "./parts";
import { UserMessage } from "./UserMessage";
import "./transcript.css";

export interface TranscriptProps {
  /** Content scrolls under the window header: fade it out over this height. */
  topFade: number;
  session: ChatSession;
  variant: "chat" | "quick-ai";
  models: readonly AIModelOption[];
  toolsets: readonly Toolset[];
  /** Shown when there are no messages (logo watermark, Quick AI welcome). */
  empty?: ReactNode;
  onCopy: (message: AIMessage) => void;
  onEdit?: (message: AIMessage, content: string) => void;
  onRegenerate?: (message: AIMessage, model?: ModelRef) => void;
  onOpenSettings?: () => void;
  readOnly?: boolean;
}

const STICK_THRESHOLD = 48;

/**
 * Scrollable conversation: prompts on the right, responses full width. It
 * follows the bottom while a response streams unless the user scrolled up,
 * and jumps to the latest turn when a chat opens or a message is sent.
 */
export function Transcript({ topFade, session, variant, models, toolsets, empty, onCopy, onEdit, onRegenerate, onOpenSettings, readOnly }: TranscriptProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const compact = variant === "quick-ai";
  const { transcript, chatId } = session;
  const hasPending = transcript.some((item) => item.kind === "pending");
  const isEmpty = transcript.length === 0;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = viewport.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // New chat or a new prompt: show the latest turn.
  useLayoutEffect(() => {
    stick.current = true;
    scrollToBottom();
  }, [chatId, isEmpty, scrollToBottom]);
  useEffect(() => {
    if (!hasPending) return;
    stick.current = true;
    scrollToBottom("smooth");
  }, [hasPending, scrollToBottom]);

  // Keep following the bottom as streamed content grows.
  useEffect(() => {
    const el = column.current;
    if (!el) return;
    const observer = new ResizeObserver(() => stick.current && scrollToBottom());
    observer.observe(el);
    return () => observer.disconnect();
  }, [isEmpty, scrollToBottom]);

  const onScroll = () => {
    const el = viewport.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  };

  if (isEmpty) return <div className="sc-ai-transcript sc-ai-transcript--empty">{!session.isLoading && empty}</div>;

  return (
    <ScrollArea ref={viewport} className="sc-ai-transcript" fade={{ top: topFade, bottom: 24 }} fadeMinOpacity={{ top: 0 }} onScroll={onScroll} aria-label="Conversation">
      <div ref={column} className="sc-ai-column" data-variant={variant}>
        {transcript.map((item) => {
          if (item.kind === "pending") {
            return (
              <div key="pending" className="sc-ai-turn">
                <UserMessage message={{ id: "pending", content: item.content, attachments: item.attachments }} toolsets={toolsets} compact={compact} />
                <div className="sc-ai-turn-assistant">
                  <LoadingDiamond />
                </div>
              </div>
            );
          }
          const { message, branch, live, isLast } = item;
          return message.role === "user" ? (
            <div key={message.id} className="sc-ai-turn">
              <UserMessage
                message={message}
                branch={branch}
                toolsets={toolsets}
                compact={compact}
                canEdit={!readOnly && !session.isGenerating}
                onCopy={() => onCopy(message)}
                onEdit={onEdit ? (content) => onEdit(message, content) : undefined}
                onSelectBranch={readOnly ? undefined : session.selectLeaf}
              />
              {isLast && session.isGenerating && (
                <div className="sc-ai-turn-assistant">
                  <LoadingDiamond />
                </div>
              )}
            </div>
          ) : (
            <div key={message.id} className="sc-ai-turn">
              <AssistantMessage
                message={message}
                live={live}
                branch={branch}
                models={models}
                toolsets={toolsets}
                compact={compact}
                isLast={isLast}
                onCopy={() => onCopy(message)}
                onRegenerate={!readOnly && onRegenerate && !session.isGenerating ? (model) => onRegenerate(message, model) : undefined}
                onSelectBranch={readOnly ? undefined : session.selectLeaf}
                onConfirmTool={session.confirmTool}
                onOpenSettings={onOpenSettings}
              />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
