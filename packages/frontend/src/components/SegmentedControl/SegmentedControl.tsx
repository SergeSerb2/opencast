import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { Image } from "../../icons/Image";
import "./segmented-control.css";

export interface Segment<V extends string> {
  value: V;
  title?: string;
  icon?: ImageLike;
}

export interface SegmentedControlProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  segments: Segment<V>[];
  size?: "small" | "medium";
  label?: string;
}

/** Button radio group with a sliding selection surface (§8.4). */
export function SegmentedControl<V extends string>({ value, onChange, segments, size = "small", label }: SegmentedControlProps<V>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const active = root?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
    if (!root || !active) return setIndicator(null);
    setIndicator({ left: active.offsetLeft, width: active.offsetWidth, top: active.offsetTop, height: active.offsetHeight });
  }, [value, segments]);

  return (
    <div ref={rootRef} className="sc-segmented" data-size={size} role="radiogroup" aria-label={label}>
      {indicator && <span className="sc-segmented__indicator" style={indicator} aria-hidden="true" />}
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          role="radio"
          aria-checked={segment.value === value}
          aria-label={segment.title ? undefined : segment.value}
          className="sc-segmented__item"
          data-value={segment.value}
          data-icon-only={!segment.title || undefined}
          onClick={() => onChange(segment.value)}
        >
          {segment.icon && <Image source={segment.icon} size={16} />}
          {segment.title}
        </button>
      ))}
    </div>
  );
}
