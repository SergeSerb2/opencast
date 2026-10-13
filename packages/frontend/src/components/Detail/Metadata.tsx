import { Children, Fragment, isValidElement, memo, type ReactElement, type ReactNode } from "react";
import type { ColorLike, ImageLike } from "@surgecast/protocol";
import { native } from "../../bridge/native";
import { resolveColor } from "../../icons/colors";
import { ArrowNeGlyph } from "../../icons/glyphs";
import { Image } from "../../icons/Image";
import { useTheme } from "../../theme/ThemeProvider";
import { Tag } from "../Badge/Badge";
import "./detail.css";

export type MetadataEntry =
  | { kind: "label"; title: string; text?: string; color?: ColorLike; icon?: ImageLike | null }
  | { kind: "link"; title: string; text: string; target: string }
  | { kind: "tags"; title: string; tags: { text?: string; color?: ColorLike; icon?: ImageLike; onAction?: () => void }[] }
  | { kind: "separator" };

interface LabelProps {
  title: string;
  text?: string | { value?: string; color?: ColorLike };
  icon?: ImageLike | null;
}
interface LinkProps {
  title: string;
  text: string;
  target: string;
}
interface TagListProps {
  title: string;
  children?: ReactNode;
}
interface TagListItemProps {
  text?: string;
  color?: ColorLike;
  icon?: ImageLike;
  onAction?: () => void;
}

function Label(_: LabelProps): null {
  return null;
}
function Link(_: LinkProps): null {
  return null;
}
function TagListItem(_: TagListItemProps): null {
  return null;
}
function TagList(_: TagListProps): null {
  return null;
}
TagList.Item = TagListItem;
function Separator(): null {
  return null;
}

function flat(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) out.push(...flat((child.props as { children?: ReactNode }).children));
    else out.push(child);
  });
  return out;
}

/** Turn `<Metadata>` JSX children into entries. */
export function collectMetadata(children: ReactNode): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
  for (const child of flat(children)) {
    if (child.type === Label) {
      const p = child.props as LabelProps;
      const text = typeof p.text === "object" ? p.text?.value : p.text;
      const color = typeof p.text === "object" ? p.text?.color : undefined;
      entries.push({ kind: "label", title: p.title, text, color, icon: p.icon });
    } else if (child.type === Link) {
      const p = child.props as LinkProps;
      entries.push({ kind: "link", title: p.title, text: p.text, target: p.target });
    } else if (child.type === TagList) {
      const p = child.props as TagListProps;
      entries.push({ kind: "tags", title: p.title, tags: flat(p.children).map((t) => t.props as TagListItemProps) });
    } else if (child.type === Separator) {
      entries.push({ kind: "separator" });
    }
  }
  return entries;
}

export interface MetadataProps {
  /** `<Metadata.Label>`… children, or prebuilt entries. */
  children?: ReactNode;
  entries?: MetadataEntry[];
  /** "wide": label/value rows (list detail); "narrow": stacked (Detail sidebar). */
  layout?: "wide" | "narrow";
  title?: string;
}

/** Metadata list (§5.1): wide rows 28px with odd stripes, or a narrow stacked column. */
export const MetadataView = memo(function MetadataView({ children, entries, layout = "wide", title }: MetadataProps) {
  const { appearance } = useTheme();
  const list = entries ?? collectMetadata(children);
  let stripe = 0;
  return (
    <div className="sc-metadata" data-layout={layout} data-selectable="true">
      {title && <div className="sc-metadata__title">{title}</div>}
      {list.map((entry, i) => {
        if (entry.kind === "separator") return null;
        stripe += 1;
        const odd = stripe % 2 === 1;
        let value: ReactNode = null;
        if (entry.kind === "label") {
          value = (
            <span className="sc-metadata__value" style={{ color: resolveColor(entry.color, appearance) }}>
              {entry.icon && <Image source={entry.icon} size={16} />}
              {entry.text && <span className="sc-truncate">{entry.text}</span>}
            </span>
          );
        } else if (entry.kind === "link") {
          value = (
            <a
              className="sc-metadata__value sc-metadata__link"
              href={entry.target}
              onClick={(event) => {
                event.preventDefault();
                void native.call("open.url", { url: entry.target });
              }}
            >
              <span className="sc-truncate">{entry.text}</span>
              <ArrowNeGlyph size={12} className="sc-metadata__link-icon" />
            </a>
          );
        } else {
          value = (
            <span className="sc-metadata__tags">
              {entry.tags.map((tag, t) => (
                <Tag key={t} color={tag.color} icon={tag.icon}>
                  {tag.text}
                </Tag>
              ))}
            </span>
          );
        }
        return (
          <div key={i} className="sc-metadata__row" data-odd={odd || undefined}>
            <span className="sc-metadata__label">{entry.title}</span>
            {value}
          </div>
        );
      })}
    </div>
  );
});

/** `<Metadata>` JSX namespace (Label, Link, TagList, Separator), like Raycast's `Detail.Metadata`. */
export const Metadata = Object.assign(
  function Metadata(_: { children?: ReactNode }): null {
    return null;
  },
  { Label, Link, TagList, Separator },
);
