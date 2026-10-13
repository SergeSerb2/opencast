import { useEffect, useMemo, useRef, useState } from "react";
import type { CommandMode, InstalledExtension, StoreExtension } from "@surgecast/protocol";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import {
  Badge,
  EmptyView,
  Markdown,
  MetadataView,
  ScrollArea,
  showFailureToast,
  useNavigation,
  useRegisterActions,
  useViewController,
  ViewFrame,
  type ActionPanelModel,
  type MetadataEntry,
} from "../../../components";
import { Icon } from "../../../icons/Icon";
import { Image } from "../../../icons/Image";
import { sc } from "../../../lib/keyboard";
import { isInstalledHere } from "../extensions/model";
import type { LauncherViewProps } from "../registry";
import { avatarImage, formatDate, formatVersion, hostLabel, isAIExtension, pluralize, resolveReadmeLinks, storeDeveloper, storeIcon, storeSlug, stripLeadingTitle } from "./model";
import { ScreenshotView } from "./ScreenshotView";
import { storeListingActions } from "./store-actions";
import "./store.css";

/** One extension the detail view can show; `preview` (a search result) renders before the full listing arrives. */
export interface StoreEntry {
  idOrSlug: string;
  preview?: StoreExtension;
}

const MODE_LABEL: Record<CommandMode, string> = { view: "View", "no-view": "No View", "menu-bar": "Menu Bar" };
const SCROLL_STEP = 48;

/** ↑/↓ scroll a line, Page Up/Down a screen (minus the header and footer chrome). */
function scrollDelta(key: string, viewportHeight: number): number | undefined {
  const page = viewportHeight - 120;
  switch (key) {
    case "ArrowDown":
      return SCROLL_STEP;
    case "ArrowUp":
      return -SCROLL_STEP;
    case "PageDown":
      return page;
    case "PageUp":
      return -page;
    default:
      return undefined;
  }
}

function asideEntries(listing: StoreExtension, installed: InstalledExtension | undefined): MetadataEntry[] {
  const developer = storeDeveloper(listing);
  const entries: MetadataEntry[] = [{ kind: "label", title: "Developer", text: developer.name, icon: avatarImage(developer) }];
  if (listing.version) entries.push({ kind: "label", title: "Version", text: formatVersion(listing.version) });
  if (installed?.version && listing.version && installed.version !== listing.version) entries.push({ kind: "label", title: "Installed Version", text: formatVersion(installed.version) });
  entries.push({ kind: "label", title: "Last Update", text: formatDate(listing.updatedAt) });
  if (listing.categories.length) entries.push({ kind: "tags", title: "Categories", tags: listing.categories.map((text) => ({ text })) });
  if (listing.platforms?.length) entries.push({ kind: "tags", title: "Platforms", tags: listing.platforms.map((text) => ({ text })) });
  if (listing.sourceUrl) entries.push({ kind: "link", title: "Source Code", text: hostLabel(listing.sourceUrl), target: listing.sourceUrl });
  entries.push({ kind: "link", title: "Store Page", text: hostLabel(listing.storeUrl), target: listing.storeUrl });
  return entries;
}

interface BodyProps {
  listing: StoreExtension;
  readme?: string;
  installed?: InstalledExtension;
  actions: ActionPanelModel;
}

/** Header, screenshot strip, description/commands/README and a metadata sidebar (Raycast's Store detail layout). */
function StoreDetailBody({ listing, readme, installed, actions }: BodyProps) {
  useRegisterActions(actions);
  const view = useViewController();
  const navigation = useNavigation();
  const scroller = useRef<HTMLDivElement>(null);
  const icon = storeIcon(listing.icon);
  const developer = storeDeveloper(listing);
  const screenshots = listing.screenshots ?? [];
  const markdown = useMemo(() => (readme ? stripLeadingTitle(resolveReadmeLinks(readme, listing.readmeUrl), listing.title) : ""), [readme, listing.readmeUrl, listing.title]);

  useEffect(
    () =>
      view.registerKeyHandler((event) => {
        const el = scroller.current;
        if (!el || event.metaKey || event.ctrlKey || event.altKey) return false;
        const delta = scrollDelta(event.key, el.clientHeight);
        if (delta === undefined) return false;
        el.scrollBy({ top: delta, behavior: "smooth" });
        return true;
      }),
    [view],
  );

  const openScreenshot = (index: number) => navigation.push(<ScreenshotView screenshots={screenshots} initialIndex={index} title={listing.title} icon={icon} />);

  return (
    <div className="sc-store-detail">
      <ScrollArea ref={scroller} fade={{ top: 96, bottom: 72 }} thumbInset={{ top: 64, bottom: 52 }}>
        <div className="sc-store-detail__inner">
          <header className="sc-store-detail__header">
            <Image source={icon} size={64} />
            <div className="sc-store-detail__heading">
              <h1 className="sc-heading-1 sc-truncate">{listing.title}</h1>
              <div className="sc-store-detail__facts sc-text">
                <span className="sc-store-detail__fact">
                  <Image source={avatarImage(developer)} size={16} />
                  {developer.name}
                </span>
                <span className="sc-store-detail__fact">
                  <Icon name="arrow-down-circle-16" size={16} className="sc-store-detail__fact-icon" />
                  {pluralize(listing.downloadCount, "Install")}
                </span>
                {isAIExtension(listing) && (
                  <span className="sc-store-detail__fact">
                    <Icon name="stars-16" size={16} className="sc-store-detail__fact-icon" />
                    AI Extension
                  </span>
                )}
              </div>
            </div>
            {installed && (
              <Badge color="green" size="large" icon="check-circle-16">
                Installed
              </Badge>
            )}
          </header>

          {screenshots.length > 0 && (
            <div className="sc-store-detail__gallery" role="list" aria-label="Screenshots">
              {screenshots.map((src, index) => (
                <button
                  key={index}
                  type="button"
                  role="listitem"
                  className="sc-store-detail__shot"
                  onClick={() => openScreenshot(index)}
                  aria-label={`Screenshot ${index + 1} of ${screenshots.length}`}
                >
                  <Icon name="image-16" size={32} className="sc-store-detail__shot-placeholder" />
                  <img src={src} alt="" draggable={false} loading="lazy" onLoad={(e) => (e.currentTarget.dataset.loaded = "")} />
                </button>
              ))}
            </div>
          )}

          <div className="sc-store-detail__main">
            <div className="sc-store-detail__content">
              <section className="sc-store-detail__section">
                <h2 className="sc-store-detail__label">Description</h2>
                <p className="sc-store-detail__text">{listing.description}</p>
              </section>
              {listing.commands.length > 0 && (
                <section className="sc-store-detail__section">
                  <h2 className="sc-store-detail__label">{listing.commands.length === 1 ? "Command" : "Commands"}</h2>
                  {listing.commands.map((command) => (
                    <div key={command.name} className="sc-store-detail__entry">
                      <div className="sc-store-detail__entry-title">
                        <Image source={icon} size={20} />
                        <span className="sc-truncate">{command.title}</span>
                        <span className="sc-store-detail__entry-mode">{MODE_LABEL[command.mode]}</span>
                      </div>
                      {command.description && <p className="sc-store-detail__text sc-color-secondary">{command.description}</p>}
                    </div>
                  ))}
                </section>
              )}
              {listing.tools && listing.tools.length > 0 && (
                <section className="sc-store-detail__section">
                  <h2 className="sc-store-detail__label">AI Tools</h2>
                  {listing.tools.map((tool) => (
                    <div key={tool.name} className="sc-store-detail__entry">
                      <div className="sc-store-detail__entry-title">
                        <Icon name="stars-16" size={20} className="sc-store-detail__fact-icon" />
                        <span className="sc-truncate">{tool.title}</span>
                      </div>
                      {tool.description && <p className="sc-store-detail__text sc-color-secondary">{tool.description}</p>}
                    </div>
                  ))}
                </section>
              )}
              {markdown && (
                <section className="sc-store-detail__section">
                  <h2 className="sc-store-detail__label">README</h2>
                  <Markdown className="sc-store-detail__readme">{markdown}</Markdown>
                </section>
              )}
            </div>
            <aside className="sc-store-detail__aside">
              <MetadataView layout="narrow" entries={asideEntries(listing, installed)} />
            </aside>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function LoadErrorBody({ error, retry }: { error: unknown; retry: () => void }) {
  useRegisterActions({ sections: [{ actions: [{ id: "retry", title: "Try Again", icon: "arrow-clockwise-16", shortcut: sc("cmd", "r"), onAction: retry }] }] });
  return <EmptyView title="Couldn't Load the Extension" description={errorMessage(error)} icon="warning-16" />;
}

/**
 * Store listing detail. Opened from the Store list it can step through the
 * results with ⌘[ / ⌘]; opened by id (deeplink) it shows a single extension.
 */
export function StoreExtensionDetail({ entries, initialIndex = 0 }: { entries: StoreEntry[]; initialIndex?: number }) {
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), entries.length - 1));
  const entry = entries[index];
  // Installed state comes from `extensions.list`; the listing itself doesn't change when extensions do.
  const { data, isLoading, error, refetch } = useBackend("extensions.store.get", { idOrSlug: entry.idOrSlug }, undefined, { refetchOn: [] });
  const { data: installedList } = useBackend("extensions.list", undefined);
  const { data: commands } = useBackend("commands.list", { includeDisabled: true });
  // While stepping to another extension, the previous listing stays in `data` until the next one arrives.
  const fresh = data && (entries.length === 1 || data.id === entry.preview?.id || data.id === entry.idOrSlug || storeSlug(data) === entry.idOrSlug) ? data : undefined;
  const listing = fresh ?? entry.preview;
  const installed = listing ? installedList?.find((e) => e.name === listing.name && isInstalledHere(e)) : undefined;
  const hasPreview = Boolean(entry.preview);

  useEffect(() => {
    if (error && hasPreview) showFailureToast("Could not load the extension", error);
  }, [error, hasPreview]);

  const actions = listing
    ? storeListingActions({
        listing,
        installed,
        commands,
        previous: index > 0 ? () => setIndex(index - 1) : undefined,
        next: index < entries.length - 1 ? () => setIndex(index + 1) : undefined,
      })
    : null;

  return (
    <ViewFrame navigationTitle={listing?.title ?? "Store"} navigationIcon={listing ? storeIcon(listing.icon) : "store-16"} isLoading={isLoading}>
      {listing && actions ? (
        <StoreDetailBody key={listing.id} listing={listing} readme={fresh?.readme} installed={installed} actions={actions} />
      ) : error ? (
        <LoadErrorBody error={error} retry={refetch} />
      ) : null}
    </ViewFrame>
  );
}

export interface StoreExtensionViewProps {
  /** Store id or `owner/name` slug. */
  id?: string;
}

/** `store.extension`: a Store listing opened by id (e.g. an extension deeplink). */
export function StoreExtensionView({ props }: LauncherViewProps<StoreExtensionViewProps>) {
  if (!props.id) {
    return (
      <ViewFrame navigationTitle="Store" navigationIcon="store-16">
        <EmptyView title="No Extension Selected" description="Open an extension from the Store to see its details." icon="store-16" />
      </ViewFrame>
    );
  }
  return <StoreExtensionDetail key={props.id} entries={[{ idOrSlug: props.id }]} />;
}
