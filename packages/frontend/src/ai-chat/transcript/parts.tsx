import { useState, type ReactNode } from "react";
import type { AIAttachment, AIToolCall } from "@surgecast/protocol";
import { Button } from "../../components/Button/Button";
import { ActivityIndicator, type ActivityState } from "../../components/Spinner/Spinner";
import { Icon } from "../../icons/Icon";
import { Image } from "../../icons/Image";
import { localFileUrl } from "../../icons/image-source";
import type { BranchInfo } from "../model/message-tree";
import { formatThoughtDuration, toolCallLabel } from "../lib/format";

/** ‹ 2/3 › between alternative versions of a message. */
export function BranchSwitcher({ branch, onSelect }: { branch: BranchInfo; onSelect: (leafId: string) => void }) {
  if (branch.count < 2) return null;
  return (
    <span className="sc-ai-branch" role="group" aria-label="Versions">
      <button type="button" className="sc-ai-branch__step" aria-label="Previous version" disabled={!branch.previousLeaf} onClick={() => branch.previousLeaf && onSelect(branch.previousLeaf)}>
        <Icon name="chevron-left-small-16" size={14} />
      </button>
      <span className="sc-ai-branch__label">
        {branch.index + 1}/{branch.count}
      </span>
      <button type="button" className="sc-ai-branch__step" aria-label="Next version" disabled={!branch.nextLeaf} onClick={() => branch.nextLeaf && onSelect(branch.nextLeaf)}>
        <Icon name="chevron-right-small-16" size={14} />
      </button>
    </span>
  );
}

/** The small spinning diamond shown while a response is on its way (§6.9). */
export function LoadingDiamond({ style }: { style?: React.CSSProperties }) {
  return <span className="sc-ai-diamond" style={style} role="progressbar" aria-label="Generating response" />;
}

/** Collapsible reasoning: shimmering “Thinking…” while it streams, then “Thought for Ns”. */
export function Reasoning({ text, thinking, durationMs }: { text: string; thinking: boolean; durationMs?: number }) {
  const [open, setOpen] = useState(false);
  const label = thinking ? "Thinking…" : durationMs !== undefined ? formatThoughtDuration(durationMs) : "Thoughts";
  return (
    <div className="sc-ai-disclosure" data-open={open || undefined}>
      <button type="button" className="sc-ai-disclosure__summary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="brain-16" size={16} className="sc-ai-disclosure__icon" />
        <span className="sc-ai-activity-label" data-pending={thinking || undefined}>
          {label}
        </span>
        <Icon name="chevron-right-small-16" size={16} className="sc-ai-disclosure__chevron" />
      </button>
      {open && <div className="sc-ai-disclosure__details sc-ai-reasoning" data-selectable="true">{text}</div>}
    </div>
  );
}

function activityState(call: AIToolCall): ActivityState {
  switch (call.status) {
    case "done":
      return "success";
    case "error":
      return "failure";
    case "rejected":
    case "awaiting-confirmation":
      return "warning";
    default:
      return "pending";
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** A tool call: activity row with expandable arguments/result, and the approval prompt while it waits. */
export function ToolCallView({ call, toolsetTitle, onConfirm }: { call: AIToolCall; toolsetTitle?: string; onConfirm?: (approved: boolean, always?: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const pending = call.status === "pending" || call.status === "running";
  const args = Object.entries(call.arguments ?? {});
  return (
    <div className="sc-ai-disclosure sc-ai-tool" data-open={open || undefined} data-status={call.status}>
      <button type="button" className="sc-ai-disclosure__summary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ActivityIndicator state={activityState(call)} />
        <span className="sc-ai-activity-label" data-pending={pending || undefined}>
          {toolCallLabel(call.title, call.name, call.status)}
        </span>
        {toolsetTitle && <span className="sc-ai-tool__toolset">{toolsetTitle}</span>}
        <Icon name="chevron-right-small-16" size={16} className="sc-ai-disclosure__chevron" />
      </button>
      {open && (
        <div className="sc-ai-disclosure__details" data-selectable="true">
          {args.length > 0 && <pre className="sc-ai-tool__code">{formatValue(call.arguments)}</pre>}
          {call.error && <div className="sc-ai-tool__error">{call.error}</div>}
          {call.result !== undefined && <pre className="sc-ai-tool__code">{formatValue(call.result)}</pre>}
        </div>
      )}
      {call.status === "awaiting-confirmation" && onConfirm && (
        <div className="sc-ai-confirm">
          <div className="sc-ai-confirm__title">
            Do you want to run <strong>{call.title ?? call.name}</strong>
            {toolsetTitle ? ` from ${toolsetTitle}` : ""}?
          </div>
          {args.length > 0 && (
            <dl className="sc-ai-confirm__args">
              {args.map(([key, value]) => (
                <div key={key} className="sc-ai-confirm__arg">
                  <dt>{key}</dt>
                  <dd className="sc-truncate">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="sc-ai-confirm__buttons">
            <Button size="small" variant="secondary" onClick={() => onConfirm(false)}>
              Decline
            </Button>
            <Button size="small" variant="secondary" onClick={() => onConfirm(true, true)}>
              Always Allow
            </Button>
            <Button size="small" onClick={() => onConfirm(true)}>
              Run Once
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Failure row: red rail, readable message, retry and a settings shortcut for credential errors. */
export function ErrorRow({ message, status, onRetry, onOpenSettings }: { message: string; status?: number; onRetry?: () => void; onOpenSettings?: () => void }) {
  const credentials = status === 401 || status === 403 || /api key|unauthori[sz]ed|forbidden/i.test(message);
  return (
    <div className="sc-ai-error" role="alert">
      <div className="sc-ai-error__message" data-selectable="true">
        {message}
      </div>
      {(onRetry || (credentials && onOpenSettings)) && (
        <div className="sc-ai-error__actions">
          {onRetry && (
            <Button size="small" variant="secondary" icon="arrow-clockwise-16" onClick={onRetry}>
              Retry
            </Button>
          )}
          {credentials && onOpenSettings && (
            <Button size="small" variant="secondary" icon="cog-16" onClick={onOpenSettings}>
              Open AI Settings
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function isImage(attachment: AIAttachment): boolean {
  return attachment.kind === "image" || attachment.kind === "screenshot" || Boolean(attachment.mimeType?.startsWith("image/"));
}

/** Attachments sent with a user message: image previews and document cards. */
export function AttachmentCards({ attachments }: { attachments: readonly AIAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="sc-ai-sent-attachments">
      {attachments.map((attachment) =>
        isImage(attachment) && attachment.path ? (
          <img key={attachment.id} className="sc-ai-sent-image" src={localFileUrl(attachment.path)} alt={attachment.name} draggable={false} />
        ) : (
          <div key={attachment.id} className="sc-ai-sent-doc" title={attachment.name}>
            <Image source={attachment.kind === "url" ? "globe-01-16" : attachment.kind === "text" || attachment.kind === "selection" ? "quote-block-16" : "blank-document-16"} size={22} />
            <span className="sc-ai-sent-doc__name sc-truncate">{attachment.name}</span>
          </div>
        ),
      )}
    </div>
  );
}

/** Small ghost icon button used in message action rows. */
export function MessageAction({ icon, label, onClick, children }: { icon: string; label: string; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void; children?: ReactNode }) {
  return (
    <button type="button" className="sc-ai-message-action" aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={16} />
      {children}
    </button>
  );
}
