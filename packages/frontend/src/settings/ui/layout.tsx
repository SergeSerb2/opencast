import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { Icon } from "../../icons/Icon";
import { Image } from "../../icons/Image";
import { settingId } from "../search";
import "./layout.css";

export interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Controls on the right of the section heading. */
  actions?: ReactNode;
  /** Wrap children in a card (default). Pass false for free-form content. */
  card?: boolean;
  /** Search anchor; defaults to the title. */
  anchor?: string;
  children: ReactNode;
}

/** A titled group of rows (§8.2: heading min 32px, 12px title inset, 4px gap to the card). */
export function Section({ title, description, actions, card = true, anchor, children }: SectionProps) {
  const id = anchor ?? (typeof title === "string" ? settingId(title) : undefined);
  return (
    <section className="sc-s-section" data-setting-id={id}>
      {(title || actions) && (
        <div className="sc-s-section__head">
          <div className="sc-s-section__titles">
            {title && <h2 className="sc-s-section__title">{title}</h2>}
            {description && <p className="sc-s-section__description">{description}</p>}
          </div>
          {actions && <div className="sc-s-section__actions">{actions}</div>}
        </div>
      )}
      {card ? <Card>{children}</Card> : children}
    </section>
  );
}

/** Rounded group surface: foreground 2.5%, radius 12; children are separated by inset hairlines. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`sc-s-card${className ? ` ${className}` : ""}`}>{children}</div>;
}

/** Help text: 11px secondary, clamped to two lines with a "More" toggle when it overflows. */
export function Description({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node && !expanded) setOverflowing(node.scrollHeight > node.clientHeight + 1);
  }, [children, expanded]);
  return (
    <div className="sc-s-description" data-expanded={expanded || undefined}>
      <div ref={ref} className="sc-s-description__text">
        {children}
      </div>
      {(overflowing || expanded) && (
        <button type="button" className="sc-s-description__more" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

export interface RowProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ImageLike;
  /** The control column (content-driven width). */
  children?: ReactNode;
  /** Vertical alignment of the control; rows without a description always center. */
  align?: "start" | "center";
  /** Dim and disable the whole row. */
  disabled?: boolean;
  /** Search anchor; defaults to the title. */
  anchor?: string;
  /** Stack the control under the label (wide controls such as lists and text areas). */
  layout?: "inline" | "stacked";
  className?: string;
}

/** Label + control row: min 46px, 12px padding and gap, label flexible (§8.2). */
export function Row({ title, description, icon, children, align, disabled, anchor, layout = "inline", className }: RowProps) {
  const id = anchor ?? (typeof title === "string" ? settingId(title) : undefined);
  return (
    <div
      className={`sc-s-item sc-s-row${className ? ` ${className}` : ""}`}
      data-setting-id={id}
      data-align={description ? (align ?? "start") : "center"}
      data-layout={layout}
      data-disabled={disabled || undefined}
    >
      {icon !== undefined && <Image source={icon} size={20} className="sc-s-row__icon" />}
      <div className="sc-s-row__label">
        <div className="sc-s-row__title">{title}</div>
        {description && <Description>{description}</Description>}
      </div>
      {children !== undefined && <div className="sc-s-row__control">{children}</div>}
    </div>
  );
}

export interface NavRowProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ImageLike;
  /** Right-side text before the chevron (counts, status). */
  detail?: ReactNode;
  onClick: () => void;
  /** "chevron" navigates inside Settings; "external" opens a link or another window. */
  indicator?: "chevron" | "external";
  anchor?: string;
  tone?: "default" | "destructive";
}

/** Interactive row (§8.2): min 46px, icon gap 8px, active background selection-5. */
export function NavRow({ title, description, icon, detail, onClick, indicator = "chevron", anchor, tone = "default" }: NavRowProps) {
  const id = anchor ?? (typeof title === "string" ? settingId(title) : undefined);
  return (
    <button type="button" className="sc-s-item sc-s-navrow" data-setting-id={id} data-tone={tone} onClick={onClick}>
      {icon !== undefined && <Image source={icon} size={20} className="sc-s-row__icon" />}
      <span className="sc-s-row__label">
        <span className="sc-s-row__title">{title}</span>
        {description && <span className="sc-s-navrow__description">{description}</span>}
      </span>
      {detail !== undefined && <span className="sc-s-navrow__detail">{detail}</span>}
      {tone === "default" && <Icon name={indicator === "chevron" ? "chevron-right-small-16" : "arrow-ne-16"} size={16} className="sc-s-navrow__chevron" />}
    </button>
  );
}

/** Yellow-tinted warning card (§8.2): padding 12, gap 12, radius 10, 16px icon. */
export function Callout({
  tone = "warning",
  icon,
  title,
  children,
  actions,
}: {
  tone?: "warning" | "info" | "error" | "success";
  icon?: ImageLike;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const glyph = icon ?? (tone === "info" ? "info-01-16" : tone === "success" ? "check-circle-16" : "warning-16");
  return (
    <div className="sc-s-callout" data-tone={tone} role={tone === "error" ? "alert" : undefined}>
      <Image source={glyph} size={16} className="sc-s-callout__icon" />
      <div className="sc-s-callout__body">
        {title && <div className="sc-s-callout__title">{title}</div>}
        {children && <div className="sc-s-callout__text">{children}</div>}
      </div>
      {actions && <div className="sc-s-callout__actions">{actions}</div>}
    </div>
  );
}

/** Centered introduction of an extension page (§8.6): 54px icon, 24/600 title, 13px description. */
export function Intro({ icon, title, description, children }: { icon: ImageLike; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sc-s-intro">
      <Image source={icon} size={54} className="sc-s-intro__icon" />
      <h1 className="sc-s-intro__title">{title}</h1>
      {description && <p className="sc-s-intro__description">{description}</p>}
      {children}
    </div>
  );
}

/** A horizontal group of controls with the spec's 8px gap. */
export function Controls({ children }: { children: ReactNode }) {
  return <div className="sc-s-controls">{children}</div>;
}

/** Empty state inside a card. */
export function CardEmpty({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sc-s-item sc-s-card-empty">
      <div className="sc-s-card-empty__title">{title}</div>
      {description && <div className="sc-s-card-empty__description">{description}</div>}
      {action}
    </div>
  );
}
