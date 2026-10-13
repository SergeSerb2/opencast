import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { CommandArgument, RootSearchItem } from "@surgecast/protocol";
import { errorMessage } from "../../bridge/errors";
import { useBackend } from "../../bridge/hooks";
import { EmptyView } from "../../components/EmptyView/EmptyView";
import { native } from "../../bridge/native";
import { useSetting } from "../../bridge/settings";
import { QuickAiHint, type SearchBarHandle } from "../../components/SearchBar/SearchBar";
import { ListBox } from "../../components/List/ListBox";
import type { ListItemModel, ListSectionModel } from "../../components/List/model";
import { primaryActions } from "../../components/actions/model";
import { ViewFrame } from "../../components/View/ViewFrame";
import { Icon } from "../../icons/Icon";
import { Image } from "../../icons/Image";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { hideLauncher, launchCommandInfo } from "../launch";
import { useNavigationStore } from "../navigation";
import { useLauncherStore } from "../launcher-store";
import { CalculatorCard } from "./CalculatorCard";
import { calculatorActions, rootActions } from "./root-actions";
import { buildRootSections, CALCULATOR_ID } from "./root-items";
import { rootMenu } from "./root-menu";

function openQuickAi(prompt: string) {
  useNavigationStore.getState().push({ kind: "quick-ai", prompt: prompt || undefined, title: "Quick AI", icon: { tile: { glyph: "stars-16", background: ["#FF7BC1", "#E2408F"] } } });
}

/** Root search: `search.root` on every keystroke, calculator card, fallbacks, inline arguments. */
export function RootSearch() {
  const [query, setQueryState] = useState("");
  const [args, setArgs] = useState<Record<string, string>>({});
  const resetToken = useNavigationStore((s) => s.rootResetToken);
  const setRootQuery = useLauncherStore((s) => s.setRootQuery);
  const tabToAskAi = useSetting("ai.tabToAskAi");
  const windowMode = useSetting("general.windowMode");
  const showFavoritesInCompact = useSetting("general.showFavoritesInCompactMode");
  const escapeBehavior = useSetting("keyboard.escapeKeyBehavior");

  const setQuery = useCallback(
    (text: string) => {
      setQueryState(text);
      setRootQuery(text);
    },
    [setRootQuery],
  );

  useEffect(() => {
    if (resetToken === 0) return;
    setQuery("");
    setArgs({});
  }, [resetToken, setQuery]);

  const { data, isLoading, error } = useBackend("search.root", { query }, [query]);
  const resultQuery = data?.query ?? "";

  const { sections, rows } = useMemo(() => buildRootSections(data, resultQuery), [data, resultQuery]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastResultQuery = useRef<string | null>(null);
  if (data && lastResultQuery.current !== data.query) {
    lastResultQuery.current = data.query;
    const first = sections.find((s) => s.items.length)?.items[0]?.id ?? null;
    if (first !== selectedId) setSelectedId(first);
  }

  const selectedRow = selectedId ? rows.get(selectedId) : undefined;
  const commandArgs: CommandArgument[] | undefined = selectedRow && !selectedRow.fallback && selectedRow.item.arguments?.length ? selectedRow.item.arguments : undefined;

  // Arguments belong to the selected command; start fresh when it changes.
  const argsOwner = useRef<string | undefined>(undefined);
  if (argsOwner.current !== (commandArgs ? selectedId ?? undefined : undefined)) {
    argsOwner.current = commandArgs ? selectedId ?? undefined : undefined;
    if (Object.keys(args).length) setArgs({});
  }

  const favorites = useMemo(() => [...rows.values()].filter((r) => r.item.favorite && !r.fallback).map((r) => r.item.id), [rows]);
  const searchBarRef = useRef<SearchBarHandle>(null);

  /** Actions for any row; inline arguments belong to the selected command only. */
  const actionsFor = useCallback(
    (id: string | null) => {
      if (id === CALCULATOR_ID && data?.calculator) return calculatorActions(data.calculator);
      const row = id ? rows.get(id) : undefined;
      if (!row) return null;
      const ownsArgs = id === selectedId && Boolean(commandArgs);
      return rootActions(row, {
        // Fallbacks always use what is typed now, even while results for it are loading.
        query,
        arguments: ownsArgs ? args : {},
        favoriteIndex: favorites.indexOf(row.item.id),
        favoriteCount: favorites.length,
        validateArguments: () => {
          if (!ownsArgs) return !row.item.arguments?.some((a) => a.required);
          const fields = searchBarRef.current?.arguments;
          if (!fields) return true;
          const missing = fields.validate();
          if (missing >= 0) fields.focus(missing);
          return missing < 0;
        },
      });
    },
    [data?.calculator, rows, selectedId, commandArgs, query, args, favorites],
  );
  const actions = useMemo(() => actionsFor(selectedId), [actionsFor, selectedId]);

  const listSections = useMemo<ListSectionModel[]>(
    () =>
      sections.map((section) =>
        section.id === "calculator" && data?.calculator
          ? { ...section, items: section.items.map((item): ListItemModel => ({ ...item, render: () => <CalculatorCard result={data.calculator!} /> })) }
          : section.id === "use-with"
            ? { ...section, accessory: <ManageFallbacksButton /> }
            : section,
      ),
    [sections, data?.calculator],
  );

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLElement>, field: number): boolean => {
    if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return false;
    const bar = searchBarRef.current;
    if (commandArgs && bar?.arguments) {
      const next = event.shiftKey ? field - 1 : field + 1;
      if (next >= 0 && next < commandArgs.length) bar.arguments.focus(next);
      else bar.focus();
      return true;
    }
    if (field === -1 && !event.shiftKey && tabToAskAi) {
      openQuickAi(query);
      return true;
    }
    return false;
  };

  const onEscape = () => {
    if (escapeBehavior === "pop-back-or-close" && (query || Object.keys(args).length)) {
      setQuery("");
      setArgs({});
      return;
    }
    hideLauncher();
  };

  return (
    <ViewFrame
      searchBar={{
        value: query,
        onChange: setQuery,
        placeholder: "Search for apps and commands…",
        args: commandArgs,
        argValues: args,
        onArgChange: (name, value) => setArgs((prev) => ({ ...prev, [name]: value })),
      }}
      headerAccessory={
        windowMode === "compact" && !query && showFavoritesInCompact && favorites.length ? (
          <CompactFavorites items={favorites.map((id) => rows.get(id)!.item)} />
        ) : tabToAskAi && !commandArgs ? (
          <QuickAiHint onClick={() => openQuickAi(query)} />
        ) : undefined
      }
      isLoading={isLoading && Boolean(query)}
      menu={rootMenu()}
      actions={actions}
      onSearchKeyDown={onSearchKeyDown}
      onEscape={onEscape}
      searchBarRef={searchBarRef}
    >
      <ListBox
        sections={listSections}
        selectedId={selectedId}
        onSelectedIdChange={setSelectedId}
        onActivate={(item) => {
          // A command with required arguments gets selected first so its fields appear.
          const row = rows.get(item.id);
          if (row && !row.fallback && item.id !== selectedId && row.item.arguments?.some((a) => a.required)) return;
          primaryActions(actionsFor(item.id)).primary?.onAction?.();
        }}
        activateOnClick
        numberHints
        aria-label="Search results"
        emptyView={error && !data ? <EmptyView title="Search Unavailable" description={errorMessage(error)} icon="warning-16" /> : undefined}
      />
    </ViewFrame>
  );
}

/** Compact mode: favorites as 22px icon buttons on the right of the header. */
function CompactFavorites({ items }: { items: RootSearchItem[] }) {
  return (
    <div className="sc-compact-favorites" role="toolbar" aria-label="Favorites">
      {items.slice(0, 5).map((item) => (
        <Tooltip key={item.id} content={item.title}>
          <button type="button" className="sc-compact-favorites__item" aria-label={item.title} onMouseDown={(e) => e.preventDefault()} onClick={() => void launchCommandInfo(item, { source: "root" })}>
            <Image source={item.icon} size={22} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function ManageFallbacksButton() {
  return (
    <button
      type="button"
      className="sc-section-cog"
      aria-label="Manage Fallback Commands"
      title="Manage Fallback Commands"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void native.call("window.show", { kind: "settings", route: "extensions/fallback-commands" }).catch(() => undefined)}
    >
      <Icon name="cog-16" size={12} />
    </button>
  );
}
