import { forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { CommandArgument } from "@surgecast/protocol";
import { Icon } from "../../icons/Icon";
import { Menu } from "../Menu/Menu";
import { Popover } from "../Popover/Popover";
import { Tooltip } from "../Tooltip/Tooltip";

export interface ArgumentFieldsHandle {
  focus(index: number): void;
  /** Index of the argument that has focus, or -1. */
  focusedIndex(): number;
  /** Mark every argument as touched so required errors show. Returns the first invalid index or -1. */
  validate(): number;
}

export interface ArgumentFieldsProps {
  args: CommandArgument[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  /** Keyboard handler shared with the search input (Tab cycling, Enter). */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>, index: number) => void;
}

/** Inline argument capsules after the search text (§5.6): 24px, radius 8, token fill. */
export const ArgumentFields = forwardRef<ArgumentFieldsHandle, ArgumentFieldsProps>(function ArgumentFields({ args, values, onChange, onKeyDown }, ref) {
  const refs = useRef<(HTMLInputElement | HTMLButtonElement | null)[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({
    focus: (index) => refs.current[index]?.focus(),
    focusedIndex: () => refs.current.findIndex((el) => el !== null && el === document.activeElement),
    validate: () => {
      setTouched(Object.fromEntries(args.map((a) => [a.name, true])));
      return args.findIndex((a) => a.required && !values[a.name]);
    },
  }));

  return (
    <div className="sc-arguments">
      {args.map((arg, index) => {
        const value = values[arg.name] ?? "";
        const invalid = Boolean(arg.required && touched[arg.name] && !value);
        const common = {
          "data-invalid": invalid || undefined,
          onBlur: () => setTouched((t) => ({ ...t, [arg.name]: true })),
        };
        const capsule =
          arg.type === "dropdown" ? (
            <button
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              className="sc-argument sc-argument--dropdown"
              data-placeholder={!value || undefined}
              data-state={openDropdown === index ? "open" : undefined}
              aria-label={arg.placeholder}
              onClick={() => setOpenDropdown(index)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === " ") {
                  e.preventDefault();
                  setOpenDropdown(index);
                  return;
                }
                onKeyDown?.(e, index);
              }}
              {...common}
            >
              <span className="sc-argument__value">{arg.data?.find((d) => d.value === value)?.title ?? arg.placeholder}</span>
              <Icon name="chevron-down-small-16" size={16} className="sc-argument__chevron" />
            </button>
          ) : (
            <label className="sc-argument" {...common}>
              <span className="sc-argument__sizer" aria-hidden="true">
                {(arg.type === "password" ? "•".repeat(value.length) : value) || arg.placeholder}
              </span>
              <input
                ref={(el) => {
                  refs.current[index] = el;
                }}
                className="sc-argument__input"
                type={arg.type === "password" ? "password" : "text"}
                value={value}
                placeholder={arg.placeholder}
                aria-label={arg.placeholder}
                aria-required={arg.required}
                aria-invalid={invalid}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => onChange(arg.name, e.currentTarget.value)}
                onKeyDown={(e) => onKeyDown?.(e, index)}
              />
            </label>
          );
        return (
          <span key={arg.name} className="sc-argument-wrap">
            {capsule}
            {!arg.required && (
              <Tooltip content="Optional argument">
                <span className="sc-argument__optional" aria-label="Optional">
                  ?
                </span>
              </Tooltip>
            )}
            {arg.type === "dropdown" && (
              <Popover
                open={openDropdown === index}
                onClose={() => setOpenDropdown(null)}
                anchor={refs.current[index] ?? null}
                side="bottom"
                align="start"
                alignOffset={-8}
                width={Math.max(arg.placeholder.length, ...(arg.data ?? []).map((d) => d.title.length)) * 8 + 32}
              >
                <Menu
                  layout="down"
                  showSearch={(arg.data?.length ?? 0) > 6}
                  sections={[{ items: (arg.data ?? []).map((d) => ({ id: d.value, title: d.title, checked: d.value === value })) }]}
                  initialSelectedId={value || undefined}
                  onSelect={(item) => {
                    onChange(arg.name, item.id);
                    setOpenDropdown(null);
                    refs.current[index]?.focus();
                  }}
                  onDismiss={() => {
                    setOpenDropdown(null);
                    refs.current[index]?.focus();
                  }}
                />
              </Popover>
            )}
          </span>
        );
      })}
    </div>
  );
});
