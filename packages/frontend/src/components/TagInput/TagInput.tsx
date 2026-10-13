import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { Icon } from "../../icons/Icon";
import { Image } from "../../icons/Image";
import { fuzzyFilter } from "../../lib/fuzzy";
import { Menu } from "../Menu/Menu";
import { Popover } from "../Popover/Popover";
import type { FieldValidation } from "../TextField/TextField";
import "./tag-input.css";

export interface TagOption {
  value: string;
  title: string;
  icon?: ImageLike;
}

export interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  /** Allowed values (TagPicker). Without options, typed text becomes a tag on ↵ or comma. */
  options?: TagOption[];
  placeholder?: string;
  validation?: FieldValidation;
  id?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  "aria-label"?: string;
}

/** Token field (§5.3): 20px tokens wrapping inside a 32px+ field; suggestions menu for options. */
export function TagInput({ value, onChange, options, placeholder, validation, id, autoFocus, onFocus, onBlur, ...aria }: TagInputProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const byValue = useMemo(() => new Map((options ?? []).map((o) => [o.value, o])), [options]);
  const suggestions = useMemo(() => {
    if (!options) return [];
    const available = options.filter((o) => !value.includes(o.value));
    return fuzzyFilter(available, text, (o) => [{ text: o.title }]).map((h) => h.item);
  }, [options, value, text]);

  const add = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || value.includes(trimmed)) return;
    if (options && !byValue.has(trimmed)) return;
    onChange([...value, trimmed]);
    setText("");
  };
  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
    setSelectedToken(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (options && (event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!options && (event.key === "Enter" || event.key === ",") && text.trim()) {
      event.preventDefault();
      event.stopPropagation();
      add(text);
      return;
    }
    if (event.key === "Backspace" && !text && value.length) {
      event.preventDefault();
      if (selectedToken === null) setSelectedToken(value.length - 1);
      else remove(selectedToken);
      return;
    }
    if (event.key === "ArrowLeft" && !text && value.length) {
      setSelectedToken((s) => (s === null ? value.length - 1 : Math.max(0, s - 1)));
      return;
    }
    if (event.key === "Escape" && selectedToken !== null) {
      setSelectedToken(null);
      event.stopPropagation();
      return;
    }
    setSelectedToken(null);
  };

  return (
    <>
      <div ref={fieldRef} className="sc-field sc-tag-input" data-validation={validation} data-has-tokens={value.length > 0 || undefined} onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}>
        {value.map((tag, index) => {
          const option = byValue.get(tag);
          return (
            <span key={tag} className="sc-token" data-selected={selectedToken === index || undefined} data-has-icon={option?.icon ? "" : undefined}>
              {option?.icon && <Image source={option.icon} size={12} />}
              <span className="sc-token__text">{option?.title ?? tag}</span>
              <button type="button" className="sc-token__clear" aria-label={`Remove ${option?.title ?? tag}`} onMouseDown={(e) => e.preventDefault()} onClick={() => remove(index)}>
                <Icon name="xmark-16" size={8} />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={id}
          className="sc-tag-input__input"
          value={text}
          autoFocus={autoFocus}
          placeholder={value.length ? "" : placeholder}
          aria-label={aria["aria-label"]}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setText(e.currentTarget.value);
            if (options) setOpen(true);
          }}
          onFocus={() => {
            onFocus?.();
            if (options) setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
            onBlur?.();
          }}
          onKeyDown={onKeyDown}
        />
        {options && <Icon name="chevron-down-small-16" size={16} className="sc-tag-input__chevron" />}
      </div>
      {options && (
        <Popover open={open && suggestions.length > 0} onClose={() => setOpen(false)} anchor={fieldRef.current} side="bottom" align="start" alignOffset={-3} width="anchor">
          {({ side }) => (
            <Menu
              layout={side === "top" ? "up" : "down"}
              showSearch={false}
              keyboardTarget={inputRef.current}
              sections={[{ items: suggestions.map((o) => ({ id: o.value, title: o.title, icon: o.icon })) }]}
              onSelect={(item) => {
                add(item.id);
                inputRef.current?.focus();
              }}
              onDismiss={() => {
                setOpen(false);
                inputRef.current?.focus();
              }}
            />
          )}
        </Popover>
      )}
    </>
  );
}
