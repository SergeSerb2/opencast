import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AIAttachment, AICommand, AIPreset } from "@opencast/protocol";
import { useSetting } from "../../bridge/settings";
import { showFailureToast } from "../../components/feedback/toast-store";
import { Icon } from "../../icons/Icon";
import { Image } from "../../icons/Image";
import { fuzzyFilter } from "../../lib/fuzzy";
import { findTrigger, replaceTrigger, segmentMentions, TOOLSET_KIND_TITLES, type Toolset, type Trigger } from "../model/mentions";
import { attachmentFromFile, attachmentImageUrl, clipboardAttachments } from "./attachments";
import { TriggerMenu, type TriggerSection } from "./TriggerMenu";
import "./composer.css";

export interface ComposerDraft {
  text: string;
  attachments: AIAttachment[];
  /** AI Command picked from the `/` menu; the text becomes its input. */
  command?: AICommand;
}

export const EMPTY_DRAFT: ComposerDraft = { text: "", attachments: [] };

export interface ComposerHandle {
  focus: () => void;
  /** Insert text at the caret (deeplinks, “add text”). */
  insert: (text: string) => void;
}

export interface ComposerProps {
  variant: "chat" | "quick-ai";
  draft: ComposerDraft;
  onDraftChange: (draft: ComposerDraft) => void;
  onSubmit: (draft: ComposerDraft) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  placeholder?: string;
  toolsets: readonly Toolset[];
  commands: readonly AICommand[];
  presets: readonly AIPreset[];
  onPickPreset?: (preset: AIPreset) => void;
  sendKey: "enter" | "cmd-enter";
  /** Keys the composer does not use itself (Quick AI: ↵ on an empty draft runs the primary action). Return true when handled. */
  onUnhandledKey?: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Control at the start of the capsule (AI Chat's + button). */
  leading?: ReactNode;
  autoFocus?: boolean;
}

const LINE_HEIGHT = 20;

function maxEditorHeight(): number {
  return Math.max(LINE_HEIGHT * 3, window.innerHeight * 0.66 - 106);
}

/**
 * The chat input capsule: autosizing editor with highlighted `@mentions`,
 * attachment chips, `@`/`/` suggestion menus, and send/stop. ↵ or ⌘↵ sends
 * per the “Send message” setting; the other combination inserts a newline.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { variant, draft, onDraftChange, onSubmit, onStop, isGenerating, disabled, placeholder = "Ask anything, @ tools, or / for commands…", toolsets, commands, presets, onPickPreset, sendKey, onUnhandledKey, leading, autoFocus },
  ref,
) {
  const runningAction = useSetting("ai.runningSendAction");
  const sendLabel = isGenerating ? runningAction === "steer" ? "Steer Response" : "Queue Message" : "Send Message";
  const editor = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const capsule = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [multiline, setMultiline] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const update = (patch: Partial<ComposerDraft>) => onDraftChange({ ...draftRef.current, ...patch });

  useImperativeHandle(ref, () => ({
    focus: () => editor.current?.focus(),
    insert: (text) => {
      const el = editor.current;
      const current = draftRef.current.text;
      const at = el ? el.selectionStart : current.length;
      const spacer = at > 0 && !/\s$/.test(current.slice(0, at)) ? " " : "";
      const next = current.slice(0, at) + spacer + text + current.slice(at);
      update({ text: next });
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(at + spacer.length + text.length, at + spacer.length + text.length);
      });
    },
  }));

  // Autosize up to the cap; switch to the expanded layout once the text wraps.
  useLayoutEffect(() => {
    const el = editor.current;
    if (!el) return;
    el.style.height = "0px";
    const height = Math.min(el.scrollHeight, maxEditorHeight());
    el.style.height = `${height}px`;
    setMultiline(el.scrollHeight > LINE_HEIGHT * 1.5 + 16);
    if (mirror.current) mirror.current.style.height = `${height}px`;
  }, [draft.text]);

  const trigger: Trigger | null = useMemo(() => {
    const found = findTrigger(draft.text, caret);
    return found && found.start !== dismissedAt ? found : null;
  }, [draft.text, caret, dismissedAt]);

  const sections = useMemo<TriggerSection[]>(() => {
    if (!trigger) return [];
    if (trigger.kind === "@") {
      const hits = fuzzyFilter(toolsets, trigger.query, (t) => [{ text: t.title, highlight: true }, { text: t.mention, weight: 0.9 }]);
      const byKind = new Map<string, TriggerSection>();
      for (const { item, ranges } of hits) {
        const title = TOOLSET_KIND_TITLES[item.kind];
        const section = byKind.get(title) ?? { title, items: [] };
        section.items.push({ id: `tool:${item.id}`, title: item.title, icon: item.icon ?? (item.kind === "web" ? "globe-01-16" : item.kind === "mcp" ? "plug-16" : "hammer-16"), accessory: `@${item.mention}`, ranges });
        byKind.set(title, section);
      }
      return [...byKind.values()];
    }
    const commandHits = fuzzyFilter(commands, trigger.query, (c) => [{ text: c.name, highlight: true }]);
    const presetHits = fuzzyFilter(presets, trigger.query, (p) => [{ text: p.name, highlight: true }, { text: p.description, weight: 0.6 }]);
    return [
      { title: "AI Commands", items: commandHits.map(({ item, ranges }) => ({ id: `command:${item.id}`, title: item.name, icon: item.icon ?? "stars-16", ranges })) },
      { title: "Presets", items: presetHits.map(({ item, ranges }) => ({ id: `preset:${item.id}`, title: item.name, icon: item.icon ?? "speech-bubble-16", ranges })) },
    ];
  }, [trigger, toolsets, commands, presets]);

  const ids = sections.flatMap((s) => s.items.map((i) => i.id));
  const selection = selectedId && ids.includes(selectedId) ? selectedId : ids[0];
  const menuOpen = Boolean(trigger) && !disabled;

  const pick = (id: string) => {
    if (!trigger) return;
    const [kind, ...rest] = id.split(":");
    const key = rest.join(":");
    if (kind === "tool") {
      const toolset = toolsets.find((t) => t.id === key);
      if (!toolset) return;
      const next = replaceTrigger(draft.text, trigger, `@${toolset.mention}`);
      update({ text: next.text });
      requestAnimationFrame(() => editor.current?.setSelectionRange(next.caret, next.caret));
      setCaret(next.caret);
      return;
    }
    const text = draft.text.slice(0, trigger.start) + draft.text.slice(trigger.end);
    if (kind === "command") update({ text, command: commands.find((c) => c.id === key) });
    else {
      update({ text });
      const preset = presets.find((p) => p.id === key);
      if (preset) onPickPreset?.(preset);
    }
    setCaret(trigger.start);
    requestAnimationFrame(() => editor.current?.setSelectionRange(trigger.start, trigger.start));
  };

  const canSend = !disabled && (draft.text.trim().length > 0 || draft.attachments.length > 0 || Boolean(draft.command));
  const submit = () => {
    if (!canSend) return;
    onSubmit(draftRef.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (menuOpen && ids.length) {
      const index = Math.max(0, ids.indexOf(selection ?? ""));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedId(ids[(index + (event.key === "ArrowDown" ? 1 : ids.length - 1)) % ids.length]);
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        if (selection) pick(selection);
        return;
      }
    }
    if (menuOpen && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDismissedAt(trigger?.start ?? null);
      return;
    }
    if (event.key === "Backspace" && draft.command && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
      event.preventDefault();
      update({ command: undefined });
      return;
    }
    if (event.key === "Enter" && !event.altKey && !event.ctrlKey) {
      const sends = sendKey === "enter" ? !event.shiftKey && !event.metaKey : event.metaKey && !event.shiftKey;
      if (sends && canSend) {
        event.preventDefault();
        event.stopPropagation();
        submit();
        return;
      }
    }
    if (onUnhandledKey?.(event)) event.preventDefault();
    if (event.key === "Enter") event.stopPropagation();
  };

  const onPaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files];
    if (!files.length) return;
    event.preventDefault();
    try {
      // The host saves pasted images and copied files to disk; browsers only give File objects.
      const native = await clipboardAttachments().catch(() => []);
      const added = native.length ? native : await Promise.all(files.map(attachmentFromFile));
      update({ attachments: [...draftRef.current.attachments, ...added] });
    } catch (error) {
      showFailureToast("Could not attach", error);
    }
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    event.preventDefault();
    try {
      const added = await Promise.all(files.map(attachmentFromFile));
      update({ attachments: [...draftRef.current.attachments, ...added] });
    } catch (error) {
      showFailureToast("Could not attach", error);
    }
  };

  const expanded = multiline || draft.attachments.length > 0 || Boolean(draft.command);
  const showStop = isGenerating && !canSend;

  return (
    <div
      ref={capsule}
      className="sc-ai-composer sc-glass-control"
      data-variant={variant}
      data-expanded={expanded || undefined}
      data-disabled={disabled || undefined}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => void onDrop(e)}
    >
      {draft.attachments.length > 0 && (
        <div className="sc-ai-composer__attachments">
          {draft.attachments.map((attachment) => (
            <div key={attachment.id} className="sc-ai-chip" data-kind={attachmentImageUrl(attachment) ? "image" : attachment.text !== undefined ? "text" : "document"} title={attachment.name}>
              {attachmentImageUrl(attachment) ? (
                <img src={attachmentImageUrl(attachment)} alt={attachment.name} draggable={false} />
              ) : attachment.text !== undefined ? (
                <>
                  <span className="sc-ai-chip__label">{attachment.name}</span>
                  <span className="sc-ai-chip__quote">{attachment.text.slice(0, 200)}</span>
                </>
              ) : (
                <>
                  <Image source={{ fileIcon: attachment.path ?? attachment.name }} size={32} />
                  <span className="sc-ai-chip__name sc-truncate">{attachment.name}</span>
                </>
              )}
              <button type="button" className="sc-ai-chip__remove" aria-label={`Remove ${attachment.name}`} onClick={() => update({ attachments: draftRef.current.attachments.filter((a) => a.id !== attachment.id) })}>
                <Icon name="xmark-16" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="sc-ai-composer__row">
        {leading && <div className="sc-ai-composer__leading">{leading}</div>}
        <div className="sc-ai-composer__editor">
          {draft.command && (
            <span className="sc-ai-command-pill">
              <Image source={draft.command.icon ?? "stars-16"} size={14} />
              <span className="sc-truncate">{draft.command.name}</span>
              <button type="button" aria-label="Remove command" onClick={() => update({ command: undefined })}>
                <Icon name="xmark-16" size={10} />
              </button>
            </span>
          )}
          <div className="sc-ai-composer__field">
            <div ref={mirror} className="sc-ai-composer__mirror" aria-hidden="true">
              {segmentMentions(draft.text, toolsets).map((segment, index) => (segment.mention ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>))}
              {"​"}
            </div>
            <textarea
              ref={editor}
              className="sc-ai-composer__input"
              rows={1}
              value={draft.text}
              placeholder={disabled ? "Add an AI provider to start chatting" : placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
              spellCheck
              aria-label="Message"
              onChange={(e) => {
                update({ text: e.currentTarget.value });
                setCaret(e.currentTarget.selectionStart);
                setDismissedAt(null);
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              onScroll={(e) => mirror.current && (mirror.current.scrollTop = e.currentTarget.scrollTop)}
              onKeyDown={onKeyDown}
              onPaste={(e) => void onPaste(e)}
            />
          </div>
        </div>
        <div className="sc-ai-composer__trailing">
          {showStop ? (
            <button type="button" className="sc-ai-composer__button" data-kind="stop" aria-label="Stop Response" title="Stop Response" onClick={onStop}>
              <Icon name="stop-filled-16" size={12} />
            </button>
          ) : (
            canSend && (
              <button type="button" className="sc-ai-composer__button" data-kind="send" aria-label={sendLabel} title={sendLabel} onClick={submit}>
                <Icon name="arrow-up-thick-16" size={16} />
              </button>
            )
          )}
        </div>
      </div>
      <TriggerMenu
        open={menuOpen}
        anchor={capsule.current}
        sections={sections}
        selectedId={selection}
        onHover={setSelectedId}
        onPick={pick}
        onClose={() => setDismissedAt(trigger?.start ?? null)}
        emptyText={trigger?.kind === "@" ? "No Tools" : "No Commands"}
      />
    </div>
  );
});
