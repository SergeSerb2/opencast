import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../../../icons/Icon";
import { ANCHORS, formatPercent, parsePercent, type Anchor } from "./geometry";

/** 3×3 radio grid of anchor positions; arrow keys move between cells. */
export function PositionGrid({ value, onChange, labelledBy }: { value: Anchor; onChange: (anchor: Anchor) => void; labelledBy?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(ANCHORS.findIndex((a) => a.value === value), 0);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const move = moves[event.key];
    if (!move || event.metaKey || event.altKey || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    const row = Math.min(Math.max(Math.floor(selected / 3) + move[0], 0), 2);
    const column = Math.min(Math.max((selected % 3) + move[1], 0), 2);
    const next = row * 3 + column;
    onChange(ANCHORS[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="sc-wm-positions" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
      {ANCHORS.map((anchor, index) => (
        <button
          key={anchor.value}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="button"
          role="radio"
          aria-checked={index === selected}
          aria-label={anchor.title}
          title={anchor.title}
          tabIndex={index === selected ? 0 : -1}
          className="sc-wm-positions__cell"
          data-selected={index === selected || undefined}
          data-anchor={anchor.value}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange(anchor.value);
            refs.current[index]?.focus();
          }}
        >
          <span className="sc-wm-positions__block" />
        </button>
      ))}
    </div>
  );
}

/**
 * Numeric percentage input with a leading axis label ("W", "X") and a "%"
 * suffix. ↑/↓ step by 1 (⇧ by 10).
 */
export function PercentField({ id, label, value, onChange, placeholder, error, min, max, ariaLabel }: { id: string; label: ReactNode; value: string; onChange: (value: string) => void; placeholder?: string; error?: string; min: number; max: number; ariaLabel: string }) {
  const step = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || event.metaKey || event.altKey || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    const current = parsePercent(value);
    const base = current === null || Number.isNaN(current) ? 0 : current;
    const delta = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
    onChange(formatPercent(Math.min(Math.max(base + delta, min), max) / 100));
  };
  return (
    <div className="sc-wm-percent">
      <label className="sc-field sc-text-field sc-wm-percent__field" data-validation={error ? "error" : undefined}>
        <span className="sc-wm-percent__label" aria-hidden="true">
          {label}
        </span>
        <input
          id={id}
          className="sc-field__input"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={step}
        />
        <span className="sc-wm-percent__unit" aria-hidden="true">
          %
        </span>
      </label>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Raycast-style inline field error: warning glyph and red 11px text. */
export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="sc-wm-field-error" role="alert">
      <Icon name="warning-16" size={14} />
      <span>{message}</span>
    </span>
  );
}
