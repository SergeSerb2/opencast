import { memo, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AIMessage } from "@opencast/protocol";
import { Button } from "../../components/Button/Button";
import type { BranchInfo } from "../model/message-tree";
import { segmentMentions, type Toolset } from "../model/mentions";
import { AttachmentCards, BranchSwitcher, MessageAction } from "./parts";

export interface UserMessageProps {
  message: Pick<AIMessage, "id" | "content" | "attachments">;
  branch?: BranchInfo;
  toolsets: readonly Toolset[];
  /** Quick AI collapses long prompts and hides the action row. */
  compact?: boolean;
  canEdit?: boolean;
  onCopy?: () => void;
  onEdit?: (content: string) => void;
  onSelectBranch?: (leafId: string) => void;
}

function MentionText({ text, toolsets }: { text: string; toolsets: readonly Toolset[] }) {
  return (
    <>
      {segmentMentions(text, toolsets).map((segment, index) =>
        segment.mention ? (
          <span key={index} className="sc-ai-mention" title={segment.toolset.title}>
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function EditBox({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(initial.length, initial.length);
  }, [initial]);
  const save = () => text.trim() && onSave(text.trim());
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    }
  };
  return (
    <div className="sc-ai-edit">
      <textarea ref={ref} className="sc-ai-edit__input" value={text} rows={1} aria-label="Edit message" onChange={(e) => setText(e.currentTarget.value)} onKeyDown={onKeyDown} />
      <div className="sc-ai-edit__buttons">
        <Button size="small" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="small" disabled={!text.trim() || text.trim() === initial.trim()} onClick={save}>
          Send
        </Button>
      </div>
    </div>
  );
}

/** Right-aligned prompt bubble with attachments, hover actions and the version switcher. */
export const UserMessage = memo(function UserMessage({ message, branch, toolsets, compact, canEdit, onCopy, onEdit, onSelectBranch }: UserMessageProps) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const bubble = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = bubble.current;
    if (compact && el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [compact, message.content]);

  if (editing && onEdit) {
    return (
      <div className="sc-ai-turn-user" data-editing>
        <EditBox
          initial={message.content}
          onCancel={() => setEditing(false)}
          onSave={(text) => {
            setEditing(false);
            onEdit(text);
          }}
        />
      </div>
    );
  }

  return (
    <div className="sc-ai-turn-user">
      {message.attachments && message.attachments.length > 0 && <AttachmentCards attachments={message.attachments} />}
      {message.content && (
        <div ref={bubble} className="sc-ai-bubble" data-selectable="true" data-collapsed={(compact && !expanded) || undefined}>
          <MentionText text={message.content} toolsets={toolsets} />
        </div>
      )}
      {compact && overflowing && !expanded && (
        <button type="button" className="sc-ai-show-more" onClick={() => setExpanded(true)}>
          Show more
        </button>
      )}
      {!compact && (
        <div className="sc-ai-user-footer" data-pinned={(branch && branch.count > 1) || undefined}>
          <span className="sc-ai-user-footer__actions">
            {onCopy && <MessageAction icon="copy-clipboard-16" label="Copy" onClick={onCopy} />}
            {canEdit && onEdit && <MessageAction icon="pencil-16" label="Edit" onClick={() => setEditing(true)} />}
          </span>
          {branch && onSelectBranch && <BranchSwitcher branch={branch} onSelect={onSelectBranch} />}
        </div>
      )}
    </div>
  );
});
