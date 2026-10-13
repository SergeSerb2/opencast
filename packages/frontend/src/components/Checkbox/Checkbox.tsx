import { memo, useId } from "react";
import "./checkbox.css";

export interface CheckboxProps {
  checked: boolean | "indeterminate";
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

/** 14px checkbox with an animated check stroke (§5.3, §8.4). */
export const Checkbox = memo(function Checkbox({ checked, onChange, label, disabled, id, "aria-label": ariaLabel }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const state = checked === "indeterminate" ? "indeterminate" : checked ? "checked" : "unchecked";
  return (
    <label className="sc-checkbox" data-disabled={disabled || undefined} htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        className="sc-checkbox__input"
        checked={checked === true}
        aria-checked={checked === "indeterminate" ? "mixed" : checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="sc-checkbox__box" data-state={state} aria-hidden="true">
        <svg viewBox="0 0 14 14" width="14" height="14">
          <path className="sc-checkbox__check" d="M4 7.2 6.1 9.2 10 4.6" pathLength="16" />
          <path className="sc-checkbox__dash" d="M3 7h8" />
        </svg>
      </span>
      {label && <span className="sc-checkbox__label">{label}</span>}
    </label>
  );
});
