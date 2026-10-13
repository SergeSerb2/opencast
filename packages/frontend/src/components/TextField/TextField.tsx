import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import type { ImageLike } from "@opencast/protocol";
import { Image } from "../../icons/Image";
import "./text-field.css";

export type FieldValidation = "error" | "success" | undefined;

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  size?: "default" | "small";
  validation?: FieldValidation;
  leadingIcon?: ImageLike;
  trailingIcon?: ImageLike;
  /** Button/dropdown attached to the right edge, separated by a hairline (e.g. icon picker). */
  accessory?: ReactNode;
}

/** Single-line input: 32px, radius 12, input-surface fill with a 1px border (§5.3). */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { value, onChange, size = "default", validation, leadingIcon, trailingIcon, accessory, className, disabled, ...rest },
  ref,
) {
  return (
    <div
      className={`sc-field sc-text-field${className ? ` ${className}` : ""}`}
      data-size={size}
      data-validation={validation}
      data-disabled={disabled || undefined}
      data-has-accessory={accessory ? "" : undefined}
    >
      {leadingIcon && <Image source={leadingIcon} size={16} className="sc-field__leading" />}
      <input ref={ref} className="sc-field__input" value={value} disabled={disabled} onChange={(e) => onChange(e.currentTarget.value)} spellCheck={false} autoComplete="off" {...rest} />
      {trailingIcon && <Image source={trailingIcon} size={16} className="sc-field__trailing" />}
      {accessory && (
        <>
          <span className="sc-field__divider" aria-hidden="true" />
          <span className="sc-field__accessory">{accessory}</span>
        </>
      )}
    </div>
  );
});
