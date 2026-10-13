import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ImageLike } from "@opencast/protocol";
import { Dropdown, type DropdownSection } from "../Dropdown/Dropdown";
import { flattenElements } from "./collect";

export interface ListDropdownItemProps {
  value: string;
  title: string;
  icon?: ImageLike;
  keywords?: string[];
}

export interface ListDropdownSectionProps {
  title?: string;
  children?: ReactNode;
}

export interface ListDropdownProps {
  /** Accessible name (Raycast shows it as a tooltip). */
  tooltip: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Remember the last value between launches (keyed by `id` or tooltip). */
  storeValue?: boolean;
  filtering?: boolean;
  onSearchTextChange?: (text: string) => void;
  isLoading?: boolean;
  throttle?: boolean;
  children?: ReactNode;
}

function DropdownItem(_: ListDropdownItemProps): null {
  return null;
}
function DropdownSectionMarker(_: ListDropdownSectionProps): null {
  return null;
}

export function collectDropdownSections(children: ReactNode): DropdownSection[] {
  const sections: DropdownSection[] = [];
  let loose: ListDropdownItemProps[] = [];
  const flush = () => {
    if (loose.length) sections.push({ items: loose });
    loose = [];
  };
  for (const child of flattenElements(children)) {
    if (child.type === DropdownItem) loose.push(child.props as ListDropdownItemProps);
    else if (child.type === DropdownSectionMarker) {
      flush();
      const props = child.props as ListDropdownSectionProps;
      sections.push({ title: props.title, items: flattenElements(props.children).filter((c) => c.type === DropdownItem).map((c) => c.props as ListDropdownItemProps) });
    }
  }
  flush();
  return sections;
}

const storageKey = (key: string) => `opencast.dropdown.${key}`;

/** Search-bar accessory dropdown (`List.Dropdown` / `Grid.Dropdown`). */
export function ListDropdown({ tooltip, id, value, defaultValue, onChange, placeholder, storeValue, filtering, onSearchTextChange, isLoading, children }: ListDropdownProps) {
  const sections = useMemo(() => collectDropdownSections(children), [children]);
  const firstValue = sections[0]?.items[0]?.value;
  const key = id ?? tooltip;
  const [internal, setInternal] = useState<string | undefined>(() => {
    const stored = storeValue ? (localStorage.getItem(storageKey(key)) ?? undefined) : undefined;
    return stored ?? defaultValue ?? firstValue;
  });
  const current = value ?? internal;

  // Report the initial value like Raycast does, so the parent can load accordingly.
  useEffect(() => {
    if (value === undefined && internal !== undefined) onChange?.(internal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dropdown
      variant="nav"
      aria-label={tooltip}
      value={current}
      sections={sections}
      placeholder={placeholder ?? tooltip}
      filtering={filtering ?? !onSearchTextChange}
      onSearchTextChange={onSearchTextChange}
      isLoading={isLoading}
      onChange={(next) => {
        if (value === undefined) setInternal(next);
        if (storeValue) localStorage.setItem(storageKey(key), next);
        onChange?.(next);
      }}
    />
  );
}

ListDropdown.Item = DropdownItem;
ListDropdown.Section = DropdownSectionMarker;
