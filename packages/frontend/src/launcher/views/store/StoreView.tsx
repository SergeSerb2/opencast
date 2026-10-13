import { useEffect, useMemo, useState } from "react";
import type { InstalledExtension, StoreExtension } from "@opencast/protocol";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { List, showFailureToast, useNavigation, type ActionPanelModel, type ListAccessory } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { installedExtensionIcon, installedStoreSlug, isInstalledHere } from "../extensions/model";
import type { LauncherViewProps } from "../registry";
import {
  ALL_CATEGORIES,
  avatarImage,
  formatCompactCount,
  formatFullCount,
  formatVersion,
  INSTALLED_FILTER,
  isAIExtension,
  pluralize,
  STORE_CATEGORIES,
  storeDeveloper,
  storeIcon,
  storeSectionTitle,
  storeSlug,
  supportsMacOS,
} from "./model";
import { installedListingActions, storeListingActions } from "./store-actions";
import { StoreExtensionDetail, type StoreEntry } from "./StoreExtensionView";
import { useDebouncedValue, useStoreSearch } from "./useStoreSearch";
import "./store.css";

export interface StoreViewProps {
  /** Root search text when the Store is opened as a fallback command. */
  query?: string;
}

const INSTALLED_CHECK: ListAccessory = { icon: { source: "check-circle-16", tintColor: "raycast-green" }, tooltip: "Installed and ready to use" };

function listingAccessories(listing: StoreExtension, installed: boolean): ListAccessory[] {
  const developer = storeDeveloper(listing);
  const accessories: ListAccessory[] = [];
  if (!supportsMacOS(listing)) accessories.push({ icon: "x-mark-circle-16", tooltip: "Not available for macOS" });
  if (installed) accessories.push(INSTALLED_CHECK);
  if (isAIExtension(listing)) accessories.push({ icon: "stars-16", tooltip: "AI Extension" });
  if (listing.commands.length) accessories.push({ icon: "computer-chip-16", tooltip: pluralize(listing.commands.length, "Command") });
  accessories.push({ icon: "arrow-down-circle-16", text: formatCompactCount(listing.downloadCount), tooltip: `Installs: ${formatFullCount(listing.downloadCount)}` });
  accessories.push({ icon: avatarImage(developer), tooltip: `Developer: ${developer.name}` });
  return accessories;
}

function installedAccessories(extension: InstalledExtension): ListAccessory[] {
  const accessories: ListAccessory[] = [INSTALLED_CHECK];
  if (extension.tools.length) accessories.push({ icon: "stars-16", tooltip: "AI Extension" });
  if (extension.commands.length) accessories.push({ icon: "computer-chip-16", tooltip: pluralize(extension.commands.length, "Command") });
  if (extension.version) accessories.push({ text: formatVersion(extension.version), tooltip: "Installed version" });
  return accessories;
}

function matchesInstalled(extension: InstalledExtension, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || [extension.title, extension.name, extension.description ?? "", extension.author].some((field) => field.toLowerCase().includes(q));
}

/** `store`: browse and search the extension Store, install and open extensions. */
export function StoreView({ props, title, icon }: LauncherViewProps<StoreViewProps>) {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState(props.query ?? "");
  const query = useDebouncedValue(searchText.trim(), 250);
  // Reported by the dropdown on mount (it restores the last choice), so the first search uses the right category.
  const [category, setCategory] = useState<string>();
  const showInstalled = category === INSTALLED_FILTER;
  const search = useStoreSearch({ query, category: category === ALL_CATEGORIES || showInstalled ? undefined : category, enabled: category !== undefined && !showInstalled });
  const { data: installedList, error: installedError, isLoading: loadingInstalled, refetch: refreshInstalled } = useBackend("extensions.list", undefined);
  const { data: commands } = useBackend("commands.list", { includeDisabled: true });

  useEffect(() => {
    if (search.error) showFailureToast("Could not load the Store", search.error);
  }, [search.error]);

  const installedByName = useMemo(() => new Map((installedList ?? []).filter(isInstalledHere).map((e) => [e.name, e])), [installedList]);
  const installedStore = useMemo(
    () => [...installedByName.values()].filter((e) => e.source === "store" && matchesInstalled(e, searchText)).sort((a, b) => a.title.localeCompare(b.title)),
    [installedByName, searchText],
  );

  const entries: StoreEntry[] = showInstalled ? installedStore.map((e) => ({ idOrSlug: installedStoreSlug(e) })) : search.items.map((item) => ({ idOrSlug: storeSlug(item), preview: item }));
  const showDetails = (index: number) => navigation.push(<StoreExtensionDetail entries={entries} initialIndex={index} />);
  const retry: ActionPanelModel = { sections: [{ actions: [{ id: "retry", title: "Try Again", icon: "arrow-clockwise-16", shortcut: sc("cmd", "r"), onAction: search.reload }] }] };
  const retryInstalled: ActionPanelModel = { sections: [{ actions: [{ id: "retry", title: "Try Again", icon: "arrow-clockwise-16", shortcut: sc("cmd", "r"), onAction: refreshInstalled }] }] };

  return (
    <div className="sc-store-list">
      <List
        searchText={searchText}
        onSearchTextChange={setSearchText}
        filtering={false}
        searchBarPlaceholder="Search Store for Extensions…"
        navigationTitle={title ?? "Store"}
        navigationIcon={icon}
        isLoading={category === undefined || (showInstalled ? loadingInstalled : search.isLoading)}
        pagination={showInstalled ? undefined : { hasMore: search.hasMore, onLoadMore: search.loadMore }}
        actions={showInstalled && installedError ? retryInstalled : search.error && !showInstalled ? retry : undefined}
        searchBarAccessory={
          <List.Dropdown tooltip="Filter by Category" id="store-category" storeValue defaultValue={ALL_CATEGORIES} onChange={setCategory} placeholder="Search categories…">
            <List.Dropdown.Section>
              <List.Dropdown.Item value={INSTALLED_FILTER} title="Installed" icon="check-circle-16" />
            </List.Dropdown.Section>
            <List.Dropdown.Section>
              <List.Dropdown.Item value={ALL_CATEGORIES} title="All Categories" icon="app-window-list-16" />
              {STORE_CATEGORIES.map((c) => (
                <List.Dropdown.Item key={c.value} value={c.value} title={c.title} icon={c.icon} />
              ))}
            </List.Dropdown.Section>
          </List.Dropdown>
        }
      >
        {showInstalled ? (
          <List.Section title="Installed Extensions" subtitle={String(installedStore.length)}>
            {installedStore.map((extension, index) => (
              <List.Item
                key={extension.name}
                id={`installed:${extension.name}`}
                title={extension.title}
                subtitle={extension.description}
                icon={installedExtensionIcon(extension, commands)}
                accessories={installedAccessories(extension)}
                actions={installedListingActions({ installed: extension, commands, showDetails: () => showDetails(index) })}
              />
            ))}
          </List.Section>
        ) : (
          <List.Section title={storeSectionTitle(query, category ?? ALL_CATEGORIES)}>
            {search.items.map((listing, index) => (
              <List.Item
                key={listing.id}
                id={listing.id}
                title={listing.title}
                subtitle={listing.description}
                icon={storeIcon(listing.icon)}
                accessories={listingAccessories(listing, installedByName.has(listing.name))}
                actions={storeListingActions({ listing, installed: installedByName.get(listing.name), commands, showDetails: () => showDetails(index) })}
              />
            ))}
          </List.Section>
        )}
        {showInstalled && installedError ? (
          <List.EmptyView title="Could Not Load Installed Extensions" description={errorMessage(installedError)} icon="warning-16" actions={retryInstalled} />
        ) : search.error && !showInstalled ? (
          <List.EmptyView title="Couldn't Load the Store" description={errorMessage(search.error)} icon="warning-16" actions={retry} />
        ) : showInstalled ? (
          <List.EmptyView
            title={searchText.trim() ? "No Installed Extensions Found" : "No Store Extensions Installed"}
            description={searchText.trim() ? undefined : "Extensions you install from the Store appear here."}
          />
        ) : (
          <List.EmptyView title="No Extensions Found" description={query ? `Nothing in the Store matches “${query}”.` : "This category has no extensions yet."} />
        )}
      </List>
    </div>
  );
}
