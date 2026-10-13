import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";

export interface HighlightSegment {
  text: string;
  /** Class for highlighted runs (color and background only, so metrics match the textarea). */
  className?: string;
}

export interface TextEditorProps {
  id?: string;
  value: string;
  /** New text and caret position after each edit. */
  onChange: (value: string, caret: number) => void;
  placeholder?: string;
  invalid?: boolean;
  /** Draws the text with highlighted runs behind a transparent textarea. */
  highlight?: (text: string) => HighlightSegment[];
  /** Buttons along the bottom edge. */
  toolbar?: ReactNode;
  "aria-labelledby"?: string;
}

/** The large multi-line field of the two-column editors (Raycast's prompt editor). */
export const TextEditor = forwardRef<HTMLTextAreaElement | null, TextEditorProps>(function TextEditor(
  { id, value, onChange, placeholder, invalid, highlight, toolbar, ...aria },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  useImperativeHandle<HTMLTextAreaElement | null, HTMLTextAreaElement | null>(ref, () => textareaRef.current, []);

  const syncScroll = () => {
    if (backdropRef.current && textareaRef.current) backdropRef.current.scrollTop = textareaRef.current.scrollTop;
  };

  return (
    <div className="sc-field sc-ai-text-editor" data-validation={invalid ? "error" : undefined} data-highlighted={highlight ? "" : undefined}>
      <div className="sc-ai-text-editor__surface">
        {highlight && (
          <div ref={backdropRef} className="sc-ai-text-editor__backdrop" aria-hidden="true">
            {highlight(value).map((segment, i) => (segment.className ? <mark key={i} className={segment.className}>{segment.text}</mark> : <span key={i}>{segment.text}</span>))}
            {/* A trailing newline needs a character after it to take up a line. */}
            {"​"}
          </div>
        )}
        <textarea
          ref={textareaRef}
          id={id}
          className="sc-ai-text-editor__input"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.currentTarget.value, e.currentTarget.selectionStart)}
          onScroll={syncScroll}
          {...aria}
        />
      </div>
      {toolbar && <div className="sc-ai-text-editor__toolbar">{toolbar}</div>}
    </div>
  );
});
