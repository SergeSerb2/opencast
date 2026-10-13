import { useEffect, useMemo, useRef, useState } from "react";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Menu, type MenuItem } from "../../components/Menu/Menu";
import { Popover } from "../../components/Popover/Popover";
import { showFailureToast } from "../../components/feedback/toast-store";
import { Icon } from "../../icons/Icon";
import { copyToClipboard } from "../lib/output";
import { CODE_LANGUAGES, languageLabel } from "./code-highlight";
import "./code-block.css";

function LanguageMenu({ language, onChange }: { language: string; onChange: (language: string) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const items = useMemo<MenuItem[]>(() => {
    const known = CODE_LANGUAGES.some((entry) => entry.value === language);
    const entries = known ? CODE_LANGUAGES : [{ value: language, label: languageLabel(language) }, ...CODE_LANGUAGES];
    return entries.map((entry) => ({ id: entry.value || "auto", title: entry.label, checked: entry.value === language }));
  }, [language]);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sc-notes-code-block__language"
        data-state={open ? "open" : "closed"}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <span className="sc-truncate">{languageLabel(language)}</span>
        <Icon name="chevron-down-16" size={12} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={triggerRef.current} side="bottom" align="end" width={160} aria-label="Code Language" role="dialog">
        {({ side }) => (
          <Menu
            sections={[{ items }]}
            layout={side === "top" ? "up" : "down"}
            searchPlaceholder="Search languages…"
            initialSelectedId={language || "auto"}
            maxHeight={300}
            onSelect={(item) => {
              onChange(item.id === "auto" ? "" : item.id);
              setOpen(false);
            }}
            onDismiss={() => setOpen(false)}
            aria-label="Code Language"
          />
        )}
      </Popover>
    </>
  );
}

function CopyButton({ text }: { text: () => string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await copyToClipboard(text());
      setCopied(true);
    } catch (error) {
      showFailureToast("Failed to copy to clipboard", error);
    }
  };
  return (
    <button
      type="button"
      className="sc-notes-code-block__copy"
      data-copied={copied || undefined}
      aria-label="Copy Code"
      title="Copy Code"
      onMouseDown={(event) => event.preventDefault()}
      onClick={copy}
    >
      <Icon name="checkmark-16" size={16} className={`sc-notes-code-block__copy-icon${copied ? " is-visible" : ""}`} color="var(--green)" />
      <Icon name="copy-clipboard-16" size={16} className={`sc-notes-code-block__copy-icon${copied ? "" : " is-visible"}`} />
    </button>
  );
}

/** Code block with a language menu and a copy button above the code (§7.4 code controls). */
export function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const nodeRef = useRef(node);
  nodeRef.current = node;
  return (
    <NodeViewWrapper className="sc-notes-code-block">
      <div className="sc-notes-code-block__toolbar" contentEditable={false}>
        {editor.isEditable ? (
          <LanguageMenu language={language} onChange={(value) => updateAttributes({ language: value || null })} />
        ) : (
          <span className="sc-notes-code-block__language">{languageLabel(language)}</span>
        )}
        <CopyButton text={() => nodeRef.current.textContent} />
      </div>
      <pre className="sc-notes-code-block__pre">
        <NodeViewContent<"code"> as="code" className="sc-notes-code-block__code" />
      </pre>
    </NodeViewWrapper>
  );
}
