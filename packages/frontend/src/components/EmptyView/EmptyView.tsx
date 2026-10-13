import { memo, type ReactNode } from "react";
import type { ImageLike } from "@opencast/protocol";
import { Image } from "../../icons/Image";
import "./empty-view.css";

/** Default illustration: a window being searched (drawn for OpenCast). */
export function EmptyIllustration() {
  return (
    <svg className="sc-empty-view__illustration" width="100" height="78" viewBox="0 0 100 78" fill="none" aria-hidden="true">
      <rect x="10" y="14.5" width="80" height="52" rx="5" fill="currentColor" fillOpacity="0.1" />
      <path d="M10 26h80" stroke="currentColor" strokeOpacity="0.14" />
      <circle cx="19" cy="20.3" r="1.6" fill="currentColor" fillOpacity="0.28" />
      <circle cx="24.5" cy="20.3" r="1.6" fill="currentColor" fillOpacity="0.28" />
      <circle cx="30" cy="20.3" r="1.6" fill="currentColor" fillOpacity="0.28" />
      <circle cx="18.5" cy="18.5" r="18.4" fill="currentColor" fillOpacity="0.06" />
      <circle cx="18.5" cy="18.5" r="18.4" stroke="currentColor" strokeOpacity="0.62" strokeWidth="3.8" />
      <path d="M31.8 31.8 42.6 42.6" stroke="currentColor" strokeOpacity="0.62" strokeWidth="4.1" strokeLinecap="round" />
    </svg>
  );
}

export interface EmptyViewProps {
  title?: string;
  description?: string;
  /** Icon/image; omitted → default illustration; `null` → no image. */
  icon?: ImageLike | null;
  /** Call to action under the text (e.g. the primary action). */
  action?: { title: string; onAction: () => void };
  children?: ReactNode;
}

/** Centered empty state: image, 13px secondary title, tertiary description, optional button (§5.8). */
export const EmptyView = memo(function EmptyView({ title = "No Results", description, icon, action, children }: EmptyViewProps) {
  return (
    <div className="sc-empty-view" role="status">
      <div className="sc-empty-view__stack">
        {icon === undefined ? <EmptyIllustration /> : icon !== null && <Image source={icon} size={64} className="sc-empty-view__icon" />}
        <div className="sc-empty-view__info">
          {title && <div className="sc-empty-view__title">{title}</div>}
          {description && <div className="sc-empty-view__description">{description}</div>}
        </div>
        {action && (
          <button type="button" className="sc-empty-view__action" onMouseDown={(e) => e.preventDefault()} onClick={action.onAction}>
            {action.title}
          </button>
        )}
        {children}
      </div>
    </div>
  );
});
