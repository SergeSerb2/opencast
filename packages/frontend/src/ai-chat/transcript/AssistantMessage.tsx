import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { AIMessage, AIModelOption, ModelRef } from "@surgecast/protocol";
import { Markdown } from "../../components/Markdown/Markdown";
import type { BranchInfo } from "../model/message-tree";
import type { Toolset } from "../model/mentions";
import { modelName } from "../model/models";
import { reasoningDurationMs, type LiveStream } from "../model/stream";
import { ModelPicker } from "../components/ModelPicker";
import { formatMessageTime, usageSummary } from "../lib/format";
import { reasoningDuration } from "../state/reasoning-durations";
import { BranchSwitcher, ErrorRow, LoadingDiamond, MessageAction, Reasoning, ToolCallView } from "./parts";
import { useSmoothText } from "./useSmoothText";

export interface AssistantMessageProps {
  message: AIMessage;
  live?: LiveStream;
  branch?: BranchInfo;
  models: readonly AIModelOption[];
  toolsets: readonly Toolset[];
  /** Quick AI: no per-turn action row. */
  compact?: boolean;
  /** The latest response keeps its action row visible. */
  isLast: boolean;
  onCopy: () => void;
  onRegenerate?: (model?: ModelRef) => void;
  onSelectBranch?: (leafId: string) => void;
  onConfirmTool?: (callId: string, approved: boolean, always?: boolean) => void;
  onOpenSettings?: () => void;
}

/** Position of the end of the rendered text inside `container`, for the trailing diamond. */
function endOfText(container: HTMLElement): { x: number; y: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, { acceptNode: (node) => (node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  let last: Node | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node;
  const text = last?.textContent?.trimEnd();
  if (!last || !text) return null;
  // Measure the last visible character; a collapsed range has no box in some engines.
  const range = document.createRange();
  range.setStart(last, text.length - 1);
  range.setEnd(last, text.length);
  const rects = range.getClientRects();
  const rect = rects[rects.length - 1];
  if (!rect) return null;
  const box = container.getBoundingClientRect();
  return { x: rect.right - box.left, y: rect.top - box.top + rect.height / 2 };
}

/** A response: reasoning, tool activity, streamed Markdown, errors and the action row. */
export const AssistantMessage = memo(function AssistantMessage({ message, live, branch, models, toolsets, compact, isLast, onCopy, onRegenerate, onSelectBranch, onConfirmTool, onOpenSettings }: AssistantMessageProps) {
  const streaming = message.status === "streaming";
  const text = useSmoothText(message.content, streaming);
  const revealing = streaming || text.length < message.content.length;
  const reasoningText = message.reasoning ?? "";
  const thinking = streaming && Boolean(reasoningText) && !message.content && !(message.toolCalls?.length ?? 0);
  const duration = (live ? reasoningDurationMs(live) : undefined) ?? reasoningDuration(message.id);
  const nothingYet = streaming && !text && !reasoningText && !(message.toolCalls?.length ?? 0);
  const content = useRef<HTMLDivElement>(null);
  const [diamond, setDiamond] = useState<{ x: number; y: number } | null>(null);
  const [picker, setPicker] = useState<HTMLElement | null>(null);

  // The diamond follows the end of the text while it streams.
  useLayoutEffect(() => {
    if (!revealing || !content.current || !text) {
      setDiamond(null);
      return;
    }
    setDiamond(endOfText(content.current));
  }, [text, revealing]);

  // Extension and MCP tools name their source; web and built-in tools speak for themselves.
  const toolsetTitle = (name: string) => {
    const toolset = toolsets.find((t) => t.tools.some((tool) => tool.name === name));
    return toolset && (toolset.kind === "extension" || toolset.kind === "mcp") ? toolset.title : undefined;
  };
  const usage = usageSummary(message.usage);
  const showActions = !compact && !streaming && message.status !== "error" && (message.content || message.status === "stopped");

  return (
    <div className="sc-ai-turn-assistant" data-last={isLast || undefined}>
      {reasoningText && <Reasoning text={reasoningText} thinking={thinking} durationMs={duration} />}
      {message.toolCalls?.map((call) => <ToolCallView key={call.id} call={call} toolsetTitle={toolsetTitle(call.name)} onConfirm={onConfirmTool ? (approved, always) => onConfirmTool(call.id, approved, always) : undefined} />)}
      {nothingYet && <LoadingDiamond />}
      {text && (
        <div ref={content} className="sc-ai-answer">
          <Markdown variant="chat">{text}</Markdown>
          {diamond && <LoadingDiamond style={{ "--x": `${diamond.x + 6}px`, "--y": `${diamond.y}px` } as CSSProperties} />}
        </div>
      )}
      {message.status === "stopped" && !message.content && <div className="sc-ai-stopped">Response stopped</div>}
      {message.status === "error" && <ErrorRow message={message.error ?? "The response failed."} status={live?.error?.status} onRetry={onRegenerate ? () => onRegenerate() : undefined} onOpenSettings={onOpenSettings} />}
      {showActions && (
        <div className="sc-ai-assistant-actions" data-pinned={isLast || undefined}>
          <MessageAction icon="copy-clipboard-16" label="Copy" onClick={onCopy} />
          {onRegenerate && <MessageAction icon="arrow-clockwise-16" label="Regenerate" onClick={() => onRegenerate()} />}
          {branch && onSelectBranch && <BranchSwitcher branch={branch} onSelect={onSelectBranch} />}
          <span className="sc-ai-assistant-meta">
            {onRegenerate && message.model ? (
              <button type="button" className="sc-ai-meta-model" title="Regenerate with another model" onClick={(e) => setPicker(e.currentTarget)}>
                {modelName(models, message.model)}
              </button>
            ) : (
              message.model && <span>{modelName(models, message.model)}</span>
            )}
            <span>{formatMessageTime(message.updatedAt)}</span>
            {usage && <span>{usage}</span>}
          </span>
        </div>
      )}
      {onRegenerate && <ModelPicker open={Boolean(picker)} anchor={picker} onClose={() => setPicker(null)} models={models} value={message.model} onPick={(ref) => onRegenerate(ref)} side="top" title="Regenerate With" />}
    </div>
  );
});
