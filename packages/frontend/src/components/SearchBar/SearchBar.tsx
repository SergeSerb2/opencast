import { forwardRef, memo, useImperativeHandle, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { CommandArgument, ImageLike } from "@surgecast/protocol";
import { SurgecastLogo } from "../../icons/glyphs";
import { Image } from "../../icons/Image";
import { sc } from "../../lib/keyboard";
import { Shortcut } from "../Keycap/Keycap";
import { LoadingBar } from "../Spinner/Spinner";
import { ArgumentFields, type ArgumentFieldsHandle } from "./ArgumentFields";
import { ProgressiveBlur } from "./ProgressiveBlur";
import "./search-bar.css";

export interface SearchBarHandle {
  focus(): void;
  readonly input: HTMLInputElement | null;
  readonly arguments: ArgumentFieldsHandle | null;
}

export interface SearchBarProps {
  value?: string;
  onChange?: (text: string) => void;
  placeholder?: string;
  /** Left glyph: the Surgecast mark (root), a back chevron (pushed views), a custom image, or nothing. */
  leading?: "logo" | "back" | ImageLike | null;
  onBack?: () => void;
  /** Right side: dropdown accessory, Quick AI hint, link accessory… */
  accessory?: ReactNode;
  /** Inline arguments after the text (commands with arguments). */
  args?: CommandArgument[];
  argValues?: Record<string, string>;
  onArgChange?: (name: string, value: string) => void;
  /** Key handling for the input and argument fields (index -1 = search input). */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>, field: number) => void;
  isLoading?: boolean;
  /** Replace the input with custom content (e.g. a title stack). */
  children?: ReactNode;
  autoFocus?: boolean;
  /** Hide the input (Detail/Form views keep the header for back + accessory). */
  hideInput?: boolean;
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
}

const TAB = sc("tab");

/** "Quick AI ⇥" hint shown on the right of root search. */
export const QuickAiHint = memo(function QuickAiHint({ onClick, label = "Quick AI" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="sc-quick-ai-hint" onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <span>{label}</span>
      <Shortcut shortcut={TAB} size="medium" />
    </button>
  );
});

/**
 * Launcher header (§3.2): 64px overlay with progressive blur, 22px logo or back
 * chevron, 18px/350 search input, inline arguments, and a right accessory.
 */
export const SearchBar = forwardRef<SearchBarHandle, SearchBarProps>(function SearchBar(
  { value = "", onChange, placeholder = "Search…", leading = null, onBack, accessory, args, argValues, onArgChange, onKeyDown, isLoading = false, children, autoFocus = true, hideInput = false, ...aria },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const argsRef = useRef<ArgumentFieldsHandle>(null);
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus({ preventScroll: true }),
    get input() {
      return inputRef.current;
    },
    get arguments() {
      return argsRef.current;
    },
  }));

  const hasArgs = Boolean(args && args.length > 0);

  let leadingNode: ReactNode = null;
  if (leading === "logo") leadingNode = <SurgecastLogo size={22} className="sc-search-bar__logo" />;
  else if (leading === "back")
    leadingNode = (
      <button type="button" className="sc-search-bar__back" aria-label="Back" title={"Esc to go back\n⌘Esc to go to root search"} onMouseDown={(e) => e.preventDefault()} onClick={onBack}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M13.4 4.2 6.6 11l6.8 6.8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  else if (leading) leadingNode = <Image source={leading} size={22} />;

  return (
    <header className="sc-search-bar" data-has-args={hasArgs || undefined}>
      <ProgressiveBlur height={72} />
      <LoadingBar loading={isLoading} />
      {leadingNode && <span className="sc-search-bar__leading">{leadingNode}</span>}
      {children ?? (hideInput ? (
        <div className="sc-search-bar__spacer" />
      ) : (
        <div className="sc-search-bar__field">
          {hasArgs && (
            <span className="sc-search-bar__sizer" aria-hidden="true">
              {value || placeholder}
            </span>
          )}
          <input
            ref={inputRef}
            className="sc-search-bar__input"
            value={value}
            placeholder={placeholder}
            autoFocus={autoFocus}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-label={placeholder}
            onChange={(e) => onChange?.(e.currentTarget.value)}
            onKeyDown={(e) => onKeyDown?.(e, -1)}
            {...aria}
          />
        </div>
      ))}
      {hasArgs && args && <ArgumentFields ref={argsRef} args={args} values={argValues ?? {}} onChange={(name, v) => onArgChange?.(name, v)} onKeyDown={onKeyDown} />}
      {accessory && <div className="sc-search-bar__accessory">{accessory}</div>}
    </header>
  );
});
