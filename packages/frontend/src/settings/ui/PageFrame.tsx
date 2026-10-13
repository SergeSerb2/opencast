import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { getEnv } from "../../bridge/env";
import { native } from "../../bridge/native";
import { ScrollArea } from "../../components/ScrollArea/ScrollArea";
import { Icon } from "../../icons/Icon";
import { useSettingsNavigation } from "../navigation";
import "./page-frame.css";

export interface PageFrameProps {
  title: string;
  /**
   * "scroll": the header title fades in once the page's top scrolls away
   * (General, extension pages); "always": shown from the start (subpages).
   */
  titleMode?: "scroll" | "always";
  /** Right-side header options (search fields, filters, page actions). */
  actions?: ReactNode;
  children: ReactNode;
}

/** Start a native window drag from empty chrome (the WKWebView has no drag regions). */
export function startWindowDrag(event: MouseEvent<HTMLElement>): void {
  if (event.button !== 0 || event.target !== event.currentTarget || !native.available) return;
  void native.call("window.startDrag", { kind: getEnv().window }).catch(() => undefined);
}

function HistoryButtons() {
  const canGoBack = useSettingsNavigation((s) => s.back.length > 0);
  const canGoForward = useSettingsNavigation((s) => s.forward.length > 0);
  const back = useSettingsNavigation((s) => s.back_);
  const forward = useSettingsNavigation((s) => s.forward_);
  return (
    <div className="sc-s-history sc-glass-control" role="group" aria-label="History">
      <button type="button" className="sc-s-history__button" onClick={back} disabled={!canGoBack} aria-label="Back" title="Back (⌘[)">
        <Icon name="chevron-left-16" size={20} />
      </button>
      <span className="sc-s-history__separator" aria-hidden="true" />
      <button type="button" className="sc-s-history__button" onClick={forward} disabled={!canGoForward} aria-label="Forward" title="Forward (⌘])">
        <Icon name="chevron-right-16" size={20} />
      </button>
    </div>
  );
}

/** How long to keep looking for a searched row while the page loads its data. */
const HIGHLIGHT_WAIT_MS = 1500;

const HIGHLIGHT_FALLBACKS: Record<string, string[]> = {
  "web-search-api-key": ["web-search-provider"],
  theme: ["follow-system-appearance"],
  "dark-theme": ["theme"],
  "light-theme": ["theme"],
  "server-url": ["server"],
  "access-token": ["cloud-sync"],
  "encryption-passphrase": ["cloud-sync"],
  "device-name": ["cloud-sync"],
  "sync-now": ["connect-to-your-server"],
  "sync-every": ["connect-to-your-server"],
  "synced-devices": ["connect-to-your-server"],
  "danger-zone": ["connect-to-your-server"],
  "disconnect-this-mac": ["connect-to-your-server"],
  "delete-cloud-sync-data-devices": ["connect-to-your-server"],
};

/**
 * Main-pane chrome for one settings page: the 52px overlay header (history
 * buttons, title, options) above a scrolling content column with the spec's
 * 16px insets. Scrolls to and pulses the row picked in settings search.
 */
export function PageFrame({ title, titleMode = "scroll", actions, children }: PageFrameProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const highlight = useSettingsNavigation((s) => s.highlight);
  const clearHighlight = useSettingsNavigation((s) => s.clearHighlight);

  useEffect(() => {
    if (!highlight) return;
    const started = performance.now();
    let frame = 0;
    const find = () => {
      const target = [highlight, ...(HIGHLIGHT_FALLBACKS[highlight] ?? [])]
        .map((id) => contentRef.current?.querySelector<HTMLElement>(`[data-setting-id="${CSS.escape(id)}"]`))
        .find(Boolean);
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.classList.remove("sc-s-highlight");
        void target.offsetWidth;
        target.classList.add("sc-s-highlight");
        clearHighlight();
        return;
      }
      if (performance.now() - started < HIGHLIGHT_WAIT_MS) frame = requestAnimationFrame(find);
      else clearHighlight();
    };
    frame = requestAnimationFrame(find);
    return () => cancelAnimationFrame(frame);
  }, [highlight, clearHighlight]);

  const titleVisible = titleMode === "always" || scrolled;
  return (
    <div className="sc-s-page">
      {/* The header comes after the content so it paints above it without a z-index (glass needs no stacking context). */}
      <ScrollArea className="sc-s-page__scroll" thumbInset={{ top: 52 }} fade={{ top: 52 }} fadeMinOpacity={{ top: 0 }} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 24)} aria-label={title}>
        <div ref={contentRef} className="sc-s-page__content">
          {children}
        </div>
      </ScrollArea>
      <header className="sc-s-header" data-scrolled={scrolled || undefined} onMouseDown={startWindowDrag}>
        <HistoryButtons />
        <div className="sc-s-header__title sc-truncate" data-visible={titleVisible || undefined} aria-hidden={!titleVisible}>
          {title}
        </div>
        {actions && <div className="sc-s-header__actions">{actions}</div>}
      </header>
    </div>
  );
}
