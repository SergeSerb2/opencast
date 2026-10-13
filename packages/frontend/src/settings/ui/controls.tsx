import { useEffect, useState, type KeyboardEvent } from "react";
import type { ImageLike, SettingsKey, SettingValue } from "@opencast/protocol";
import { setSetting, useSetting } from "../../bridge/settings";
import { Dropdown } from "../../components/Dropdown/Dropdown";
import { Switch } from "../../components/Switch/Switch";
import { TextField } from "../../components/TextField/TextField";
import { showFailureToast } from "../../components/feedback/toast-store";

/** Write a setting through `settings.set`; a failure rolls back and shows a toast. */
export async function saveSetting<K extends SettingsKey>(key: K, value: SettingValue<K>): Promise<void> {
  try {
    await setSetting(key, value);
  } catch (error) {
    showFailureToast("Could not save setting", error);
  }
}

/** A setting's live value (follows `settings.changed`) and a saving setter. */
export function useSettingState<K extends SettingsKey>(key: K): [SettingValue<K>, (value: SettingValue<K>) => void] {
  const value = useSetting(key);
  return [value, (next) => void saveSetting(key, next)];
}

type BooleanKey = { [K in SettingsKey]: SettingValue<K> extends boolean ? K : never }[SettingsKey];

/** Switch bound to a boolean setting. */
export function SettingSwitch({ setting, disabled, label }: { setting: BooleanKey; disabled?: boolean; label?: string }) {
  const [value, setValue] = useSettingState(setting);
  return <Switch checked={value} onChange={(checked) => setValue(checked as SettingValue<typeof setting>)} disabled={disabled} label={label} />;
}

export interface SelectOption<T> {
  value: T;
  title: string;
  icon?: ImageLike;
}

export interface SelectProps<T> {
  value: T;
  onChange: (value: T) => void;
  options?: readonly SelectOption<T>[];
  sections?: readonly { title?: string; options: readonly SelectOption<T>[] }[];
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  variant?: "ghost" | "field" | "small";
  /** Show a search field in the menu (long lists). */
  searchable?: boolean;
}

/** Popup button for settings rows (small ghost popup, §8.4) over typed values. */
export function Select<T extends string | number | null>({ value, onChange, options, sections, placeholder, disabled, label, variant = "ghost", searchable }: SelectProps<T>) {
  const groups = sections ?? [{ options: options ?? [] }];
  const encode = (v: T) => JSON.stringify(v);
  const all = groups.flatMap((g) => g.options);
  return (
    <Dropdown
      variant={variant}
      value={encode(value)}
      onChange={(raw) => {
        const option = all.find((o) => encode(o.value) === raw);
        if (option) onChange(option.value);
      }}
      sections={groups.map((g) => ({ title: g.title, items: g.options.map((o) => ({ value: encode(o.value), title: o.title, icon: o.icon })) }))}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={label}
      showSearch={searchable ?? all.length > 12}
    />
  );
}

type OptionKey = { [K in SettingsKey]: SettingValue<K> extends string | number | null ? K : never }[SettingsKey];

/** Select bound to a string/number setting. */
export function SettingSelect<K extends OptionKey>({ setting, options, disabled, label }: { setting: K; options: readonly SelectOption<SettingValue<K>>[]; disabled?: boolean; label?: string }) {
  const [value, setValue] = useSettingState(setting);
  return (
    <Select
      value={value as SettingValue<K> & (string | number | null)}
      options={options as readonly SelectOption<SettingValue<K> & (string | number | null)>[]}
      onChange={setValue}
      disabled={disabled}
      label={label}
    />
  );
}

export interface CommitTextFieldProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  width?: number;
  type?: "text" | "password" | "url" | "number";
  /** Return an error message to reject the value (the field shows the error state and keeps the text). */
  validate?: (value: string) => string | null;
  disabled?: boolean;
  label?: string;
  size?: "default" | "small";
}

/** Text field that saves on Enter or blur (not on every keystroke); Esc reverts. */
export function CommitTextField({ value, onCommit, placeholder, width = 200, type = "text", validate, disabled, label, size = "small" }: CommitTextFieldProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft === value) return setError(null);
    const problem = validate?.(draft) ?? null;
    setError(problem);
    if (!problem) onCommit(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape" && draft !== value) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(value);
      setError(null);
    }
  };
  return (
    <span className="sc-s-commit-field" style={{ width }} title={error ?? undefined}>
      <TextField
        size={size}
        type={type}
        value={draft}
        onChange={(next) => {
          setDraft(next);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        validation={error ? "error" : undefined}
        disabled={disabled}
        aria-label={label}
        aria-invalid={error ? true : undefined}
      />
      {error && <span className="sc-s-field-error">{error}</span>}
    </span>
  );
}
