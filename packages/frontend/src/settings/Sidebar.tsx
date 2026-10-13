import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { getEnv } from "../bridge/env";
import { ScrollArea } from "../components/ScrollArea/ScrollArea";
import { Icon } from "../icons/Icon";
import { Image } from "../icons/Image";
import { BUILTIN_PAGES, CORE_PAGES, SUBPAGES, sidebarIdFor, type PageEntry } from "./catalog";
import { navigate } from "./navigation";
import { searchSettings, settingId } from "./search";
import { startWindowDrag } from "./ui/PageFrame";

function NavItem({ page, selected, parentTitle }: { page: PageEntry; selected: boolean; parentTitle?: string }) {
  return (
    <button type="button" className="sc-s-nav-item" data-selected={selected || undefined} aria-current={selected ? "page" : undefined} onClick={() => navigate(page.id)}>
      <Image source={page.icon} size={22} className="sc-s-nav-item__icon" />
      <span className="sc-s-nav-item__label sc-truncate">{page.title}</span>
      {parentTitle && <span className="sc-s-nav-item__parent sc-truncate">{parentTitle}</span>}
    </button>
  );
}

/** Browser-only stand-in for the native traffic lights, so screenshots match the window. */
function DevTrafficLights() {
  return (
    <div className="sc-s-traffic-lights" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export interface SidebarProps {
  route: string;
  installed: readonly PageEntry[];
}

/**
 * Settings sidebar (§8.1): search field, then the core pages, built-in
 * extension pages and installed extensions. Typing filters pages and rows;
 * Enter opens the first result.
 */
export function Sidebar({ route, installed }: SidebarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const selectedId = sidebarIdFor(route);
  const searchable = useMemo(() => [...CORE_PAGES, ...BUILTIN_PAGES, ...SUBPAGES, ...installed], [installed]);
  const results = useMemo(() => (query.trim() ? searchSettings(searchable, query) : null), [searchable, query]);
  const titleOf = (id: string | undefined) => searchable.find((p) => p.id === id)?.title;

  useLayoutEffect(() => {
    if (query.trim()) return;
    sidebarRef.current?.querySelector<HTMLElement>(".sc-s-nav-item[data-selected]")?.scrollIntoView({ block: "nearest" });
  }, [selectedId, installed, query]);

  const openResult = (page: PageEntry, row?: string) => navigate(page.id, row ? { highlight: settingId(row) } : undefined);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && results?.[0]) {
      event.preventDefault();
      openResult(results[0].page, results[0].rows[0]);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      event.currentTarget.closest(".sc-s-sidebar")?.querySelector<HTMLButtonElement>(".sc-s-nav-item, .sc-s-nav-row")?.focus();
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".sc-s-nav-item, .sc-s-nav-row")];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && index === 0) return inputRef.current?.focus();
    items[Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  return (
    <nav ref={sidebarRef} className="sc-s-sidebar" aria-label="Settings">
      {/* Chrome after the list: it paints above the scrolling content without a z-index. */}
      <ScrollArea className="sc-s-sidebar__scroll" fade={{ top: 104 }} fadeMinOpacity={{ top: 0 }}>
        <div className="sc-s-sidebar__content" onKeyDown={onListKeyDown}>
          {results ? (
            results.length ? (
              <div className="sc-s-nav-group" role="list">
                {results.map(({ page, rows }) => (
                  <div key={page.id} className="sc-s-nav-result" role="listitem">
                    <NavItem page={page} selected={page.id === route} parentTitle={page.parent ? titleOf(page.parent) : undefined} />
                    {rows.map((row) => (
                      <button key={row} type="button" className="sc-s-nav-row sc-truncate" onClick={() => openResult(page, row)}>
                        {row}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="sc-s-nav-empty">No settings match “{query.trim()}”</div>
            )
          ) : (
            <>
              <div className="sc-s-nav-group">
                {CORE_PAGES.map((page) => (
                  <NavItem key={page.id} page={page} selected={page.id === selectedId} />
                ))}
              </div>
              <div className="sc-s-nav-group">
                {BUILTIN_PAGES.map((page) => (
                  <NavItem key={page.id} page={page} selected={page.id === selectedId} />
                ))}
              </div>
              {installed.length > 0 && (
                <div className="sc-s-nav-group">
                  {installed.map((page) => (
                    <NavItem key={page.id} page={page} selected={page.id === selectedId} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
      <div className="sc-s-sidebar__top" onMouseDown={startWindowDrag}>
        {!getEnv().native && <DevTrafficLights />}
      </div>
      <label className="sc-s-search">
        <Icon name="magnifying-glass-16" size={16} className="sc-s-search__icon" />
        <input
          ref={inputRef}
          className="sc-s-search__input"
          placeholder="Search settings…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          aria-label="Search settings"
          data-settings-search
        />
        {query && (
          <button type="button" className="sc-s-search__clear" aria-label="Clear search" onClick={() => setQuery("")}>
            <Icon name="x-mark-circle-filled-16" size={14} />
          </button>
        )}
      </label>
    </nav>
  );
}
