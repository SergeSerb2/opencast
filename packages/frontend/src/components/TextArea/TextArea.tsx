import { forwardRef, useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import type { FieldValidation } from "../TextField/TextField";
import "./text-area.css";

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  validation?: FieldValidation;
  minHeight?: number;
  maxHeight?: number;
}

/** Auto-growing multi-line field: 80–200px, radius 12, no resize handle (§5.3). */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { value, onChange, validation, minHeight = 80, maxHeight = 200, className, disabled, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(maxHeight, Math.max(minHeight, node.scrollHeight))}px`;
  }, [value, minHeight, maxHeight]);

  return (
    <div className={`sc-field sc-text-area${className ? ` ${className}` : ""}`} data-validation={validation} data-disabled={disabled || undefined}>
      <textarea ref={setRef} className="sc-text-area__input" value={value} disabled={disabled} onChange={(e) => onChange(e.currentTarget.value)} spellCheck={false} {...rest} />
    </div>
  );
});
