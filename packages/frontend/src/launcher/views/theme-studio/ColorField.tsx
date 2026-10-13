import { memo, useId } from "react";
import { TextField } from "../../../components";
import { Icon } from "../../../icons/Icon";

export interface ColorFieldProps {
  label: string;
  value: string;
  /** The color shown in the swatch (the last complete value while typing). */
  swatch: string;
  error?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/** One theme color: label, a swatch that opens the system color picker, and a hex field. */
export const ColorField = memo(function ColorField({ label, value, swatch, error, onChange, onFocus, onBlur }: ColorFieldProps) {
  const inputId = useId();
  return (
    <div className="sc-theme-editor__row" data-invalid={error ? "" : undefined}>
      <label className="sc-theme-editor__label sc-truncate" htmlFor={inputId}>
        {label}
      </label>
      <span className="sc-theme-editor__swatch" style={{ background: swatch }} title={`Pick ${label}`}>
        <input type="color" tabIndex={-1} aria-label={`Pick ${label}`} value={swatch.toLowerCase()} onChange={(e) => onChange(e.currentTarget.value.toUpperCase())} />
      </span>
      <TextField
        id={inputId}
        size="small"
        className="sc-theme-editor__hex"
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        validation={error ? "error" : undefined}
        maxLength={7}
        aria-invalid={error ? true : undefined}
      />
      {error && (
        <span className="sc-theme-editor__error" role="alert">
          <Icon name="warning-16" size={12} />
          {error}
        </span>
      )}
    </div>
  );
});
