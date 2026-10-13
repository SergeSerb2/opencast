import { useId, useRef, useState, type ReactNode } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { native } from "../../bridge/native";
import { Icon } from "../../icons/Icon";
import { Image } from "../../icons/Image";
import { formatDateValue, parseDateExpression } from "../../lib/date-expression";
import { Checkbox as CheckboxControl } from "../Checkbox/Checkbox";
import { Dropdown as DropdownControl, type DropdownSection } from "../Dropdown/Dropdown";
import { flattenElements } from "../List/collect";
import { Menu, type MenuItem } from "../Menu/Menu";
import { Popover } from "../Popover/Popover";
import { TagInput } from "../TagInput/TagInput";
import { TextArea as TextAreaControl } from "../TextArea/TextArea";
import { TextField as TextFieldControl } from "../TextField/TextField";
import { Tooltip } from "../Tooltip/Tooltip";
import { showFailureToast } from "../feedback/toast-store";
import { useFormField } from "./FormContext";

type FocusEventHandler = (event: { target: { id: string; value: unknown }; type: "focus" | "blur" }) => void;

interface FieldBase<T> {
  id: string;
  title?: string;
  info?: string;
  error?: string;
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  onFocus?: FocusEventHandler;
  onBlur?: FocusEventHandler;
  autoFocus?: boolean;
  /** Raycast persists the value between launches; Surgecast stores it per field id. */
  storeValue?: boolean;
}

/** One form row: right-aligned label column, 360px field column, error column (§5.3). */
export function FormRow({ title, info, error, htmlFor, children, compact }: { title?: string; info?: string; error?: string; htmlFor?: string; children: ReactNode; compact?: boolean }) {
  return (
    <div className="sc-form-row" data-compact={compact || undefined} data-skip-label={!title && !info ? "" : undefined}>
      {(title || info) && (
        <label className="sc-form-row__label" htmlFor={htmlFor}>
          <span className="sc-truncate">{title}</span>
          {info?.trim() && (
            <Tooltip content={info}>
              <span className="sc-form-row__info" aria-label={info}>
                <Icon name="info-01-16" size={14} />
              </span>
            </Tooltip>
          )}
        </label>
      )}
      <div className="sc-form-row__field">{children}</div>
      <div className="sc-form-row__error" role={error ? "alert" : undefined}>
        {error && (
          <Tooltip content={error} tone="error">
            <span className="sc-form-row__error-content">
              <Icon name="warning-16" size={14} />
              <span className="sc-truncate">{error}</span>
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function storedDefault<T>(id: string, storeValue: boolean | undefined, fallback: T | undefined): T | undefined {
  if (!storeValue) return fallback;
  const raw = localStorage.getItem(`surgecast.form.${id}`);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function persist(id: string, storeValue: boolean | undefined, value: unknown) {
  if (storeValue) localStorage.setItem(`surgecast.form.${id}`, JSON.stringify(value));
}

function focusHandlers(id: string, value: unknown, onFocus?: FocusEventHandler, onBlur?: FocusEventHandler) {
  return {
    onFocus: onFocus ? () => onFocus({ target: { id, value }, type: "focus" }) : undefined,
    onBlur: onBlur ? () => onBlur({ target: { id, value }, type: "blur" }) : undefined,
  };
}

export interface TextFieldProps extends FieldBase<string> {
  placeholder?: string;
}

export function TextField({ id, title, info, error, value, defaultValue, onChange, onFocus, onBlur, placeholder, autoFocus, storeValue }: TextFieldProps) {
  const field = useFormField<string>(id, { value, defaultValue: storedDefault(id, storeValue, defaultValue), fallback: "", onChange });
  const inputId = useId();
  return (
    <FormRow title={title} info={info} error={error} htmlFor={inputId}>
      <TextFieldControl
        id={inputId}
        value={field.value}
        onChange={(v) => {
          field.setValue(v);
          persist(id, storeValue, v);
        }}
        placeholder={placeholder}
        validation={error ? "error" : undefined}
        autoFocus={autoFocus ?? field.autoFocus}
        {...focusHandlers(id, field.value, onFocus, onBlur)}
      />
    </FormRow>
  );
}

export function PasswordField(props: TextFieldProps) {
  const field = useFormField<string>(props.id, { value: props.value, defaultValue: props.defaultValue, fallback: "", onChange: props.onChange });
  const inputId = useId();
  return (
    <FormRow title={props.title} info={props.info} error={props.error} htmlFor={inputId}>
      <TextFieldControl
        id={inputId}
        type="password"
        value={field.value}
        onChange={field.setValue}
        placeholder={props.placeholder}
        validation={props.error ? "error" : undefined}
        autoFocus={props.autoFocus ?? field.autoFocus}
        {...focusHandlers(props.id, field.value, props.onFocus, props.onBlur)}
      />
    </FormRow>
  );
}

export interface TextAreaProps extends FieldBase<string> {
  placeholder?: string;
  enableMarkdown?: boolean;
}

export function TextArea({ id, title, info, error, value, defaultValue, onChange, onFocus, onBlur, placeholder, autoFocus, storeValue }: TextAreaProps) {
  const field = useFormField<string>(id, { value, defaultValue: storedDefault(id, storeValue, defaultValue), fallback: "", onChange });
  const inputId = useId();
  return (
    <FormRow title={title} info={info} error={error} htmlFor={inputId}>
      <TextAreaControl
        id={inputId}
        value={field.value}
        onChange={(v) => {
          field.setValue(v);
          persist(id, storeValue, v);
        }}
        placeholder={placeholder}
        validation={error ? "error" : undefined}
        autoFocus={autoFocus ?? field.autoFocus}
        {...focusHandlers(id, field.value, onFocus, onBlur)}
      />
    </FormRow>
  );
}

export interface CheckboxProps extends FieldBase<boolean> {
  label?: string;
}

export function Checkbox({ id, title, info, error, value, defaultValue, onChange, label, storeValue }: CheckboxProps) {
  const field = useFormField<boolean>(id, { value, defaultValue: storedDefault(id, storeValue, defaultValue), fallback: false, onChange });
  return (
    <FormRow title={title} info={info} error={error} compact>
      <CheckboxControl
        checked={field.value}
        label={label}
        onChange={(v) => {
          field.setValue(v);
          persist(id, storeValue, v);
        }}
      />
    </FormRow>
  );
}

export interface DropdownItemProps {
  value: string;
  title: string;
  icon?: ImageLike;
  keywords?: string[];
}

function DropdownItem(_: DropdownItemProps): null {
  return null;
}
function DropdownSectionMarker(_: { title?: string; children?: ReactNode }): null {
  return null;
}

function collectDropdown(children: ReactNode): DropdownSection[] {
  const sections: DropdownSection[] = [];
  let loose: DropdownItemProps[] = [];
  for (const child of flattenElements(children)) {
    if (child.type === DropdownItem) loose.push(child.props as DropdownItemProps);
    else if (child.type === DropdownSectionMarker) {
      if (loose.length) sections.push({ items: loose });
      loose = [];
      const props = child.props as { title?: string; children?: ReactNode };
      sections.push({ title: props.title, items: flattenElements(props.children).filter((c) => c.type === DropdownItem).map((c) => c.props as DropdownItemProps) });
    }
  }
  if (loose.length) sections.push({ items: loose });
  return sections;
}

export interface DropdownProps extends FieldBase<string> {
  placeholder?: string;
  filtering?: boolean;
  onSearchTextChange?: (text: string) => void;
  isLoading?: boolean;
  children?: ReactNode;
}

export function Dropdown({ id, title, info, error, value, defaultValue, onChange, placeholder, filtering, onSearchTextChange, isLoading, children, storeValue }: DropdownProps) {
  const sections = collectDropdown(children);
  const first = sections[0]?.items[0]?.value;
  const field = useFormField<string>(id, { value, defaultValue: storedDefault(id, storeValue, defaultValue ?? first), fallback: "", onChange });
  return (
    <FormRow title={title} info={info} error={error}>
      <DropdownControl
        value={field.value}
        onChange={(v) => {
          field.setValue(v);
          persist(id, storeValue, v);
        }}
        sections={sections}
        placeholder={placeholder}
        filtering={filtering ?? !onSearchTextChange}
        onSearchTextChange={onSearchTextChange}
        isLoading={isLoading}
        validation={error ? "error" : undefined}
        aria-label={title}
      />
    </FormRow>
  );
}
Dropdown.Item = DropdownItem;
Dropdown.Section = DropdownSectionMarker;

export interface TagPickerItemProps {
  value: string;
  title: string;
  icon?: ImageLike;
}
function TagPickerItem(_: TagPickerItemProps): null {
  return null;
}

export interface TagPickerProps extends FieldBase<string[]> {
  placeholder?: string;
  children?: ReactNode;
}

export function TagPicker({ id, title, info, error, value, defaultValue, onChange, placeholder, children }: TagPickerProps) {
  const options = flattenElements(children)
    .filter((c) => c.type === TagPickerItem)
    .map((c) => c.props as TagPickerItemProps);
  const field = useFormField<string[]>(id, { value, defaultValue, fallback: [], onChange });
  return (
    <FormRow title={title} info={info} error={error}>
      <TagInput value={field.value} onChange={field.setValue} options={options} placeholder={placeholder} aria-label={title} />
    </FormRow>
  );
}
TagPicker.Item = TagPickerItem;

export interface DatePickerProps extends FieldBase<Date | null> {
  type?: "date" | "datetime";
}

const DATE_SUGGESTIONS = ["Today", "Tomorrow", "Next Week", "Next Month"];

export function DatePicker({ id, title, info, error, value, defaultValue, onChange, type = "datetime" }: DatePickerProps) {
  const field = useFormField<Date | null>(id, { value, defaultValue, fallback: null, onChange });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const withTime = type === "datetime";
  const parsed = parseDateExpression(query);
  const items: MenuItem[] = [
    ...(parsed && query ? [{ id: "parsed", title: formatDateValue(parsed.date, parsed.hasTime || withTime), icon: "calendar-16" }] : []),
    { id: "none", title: "No Date", icon: "xmark-circle-16" },
    ...DATE_SUGGESTIONS.map((s) => ({ id: s, title: s, icon: withTime ? "clock-16" : "calendar-16" })),
  ];
  const choose = (item: MenuItem) => {
    if (item.id === "none") field.setValue(null);
    else if (item.id === "parsed" && parsed) field.setValue(parsed.date);
    else {
      const result = parseDateExpression(item.id);
      if (result) field.setValue(result.date);
    }
    setOpen(false);
    setQuery("");
  };
  return (
    <FormRow title={title} info={info} error={error}>
      <button
        ref={triggerRef}
        type="button"
        className="sc-dropdown sc-field"
        data-variant="field"
        data-state={open ? "open" : "closed"}
        data-placeholder={!field.value || undefined}
        data-validation={error ? "error" : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
      >
        <Icon name={withTime ? "clock-16" : "calendar-16"} size={16} className="sc-dropdown__icon" />
        <span className="sc-dropdown__value sc-truncate">{field.value ? formatDateValue(field.value, withTime) : "No Date"}</span>
        <Icon name="chevron-down-small-16" size={16} className="sc-dropdown__chevron" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={triggerRef.current} side="bottom" align="start" alignOffset={-4} width="anchor">
        {({ side }) => (
          <Menu
            layout={side === "top" ? "up" : "down"}
            searchPlaceholder="Enter expression: tomorrow at 10am"
            filtering={false}
            onSearchTextChange={setQuery}
            sections={[{ items }]}
            onSelect={choose}
            onDismiss={() => setOpen(false)}
          />
        )}
      </Popover>
    </FormRow>
  );
}

export interface FilePickerProps extends FieldBase<string[]> {
  allowMultipleSelection?: boolean;
  canChooseDirectories?: boolean;
  canChooseFiles?: boolean;
  showHiddenFiles?: boolean;
  /** Surgecast: file extensions or UTIs the open panel accepts (e.g. `["rayconfig"]`). */
  allowedTypes?: string[];
}

export function FilePicker({ id, title, info, error, value, defaultValue, onChange, allowMultipleSelection = true, canChooseDirectories = false, canChooseFiles = true, allowedTypes }: FilePickerProps) {
  const field = useFormField<string[]>(id, { value, defaultValue, fallback: [], onChange });
  const pick = async () => {
    try {
      const paths = await native.call("dialog.openFiles", { canChooseFiles, canChooseDirectories, allowMultipleSelection, allowedTypes });
      if (paths) field.setValue(allowMultipleSelection ? [...new Set([...field.value, ...paths])] : paths.slice(0, 1));
    } catch (err) {
      showFailureToast("Could not open the file picker", err);
    }
  };
  const label = canChooseDirectories && !canChooseFiles ? (allowMultipleSelection ? "Select Folders" : "Select Folder") : allowMultipleSelection ? "Select Files" : "Select File";
  return (
    <FormRow title={title} info={info} error={error}>
      <button type="button" className="sc-file-picker" onMouseDown={(e) => e.preventDefault()} onClick={() => void pick()}>
        <Icon name="plus-16" size={16} />
        <span>{label}</span>
      </button>
      {field.value.length > 0 && (
        <ul className="sc-file-picker__list">
          {field.value.map((path) => (
            <li key={path} className="sc-file-picker__file">
              <Image source={{ fileIcon: path }} size={16} />
              <span className="sc-truncate">{path.split("/").pop()}</span>
              <button type="button" className="sc-file-picker__remove" aria-label={`Remove ${path}`} onClick={() => field.setValue(field.value.filter((p) => p !== path))}>
                <Icon name="xmark-16" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </FormRow>
  );
}

export function Separator() {
  return <div className="sc-form-separator" role="separator" />;
}

export function Description({ title, text }: { title?: string; text: string }) {
  return (
    <FormRow title={title}>
      <p className="sc-form-description">{text}</p>
    </FormRow>
  );
}

/** Header link shown at the top right of a form (`Form.LinkAccessory`). */
export function LinkAccessory({ text, target }: { text: string; target: string }) {
  return (
    <a
      className="sc-form-link-accessory"
      href={target}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        void native.call("open.url", { url: target });
      }}
    >
      {text}
    </a>
  );
}
