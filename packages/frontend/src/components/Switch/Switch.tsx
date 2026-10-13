import { memo } from "react";
import "./switch.css";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "medium" | "large";
  label?: string;
  id?: string;
}

/** macOS-style switch with an elongated capsule knob (§8.4). */
export const Switch = memo(function Switch({ checked, onChange, disabled, size = "medium", label, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="sc-switch"
      data-size={size}
      data-checked={checked || undefined}
      onClick={() => onChange(!checked)}
    >
      <span className="sc-switch__knob" />
    </button>
  );
});
