import { useMemo, useState } from "react";
import type { CommandInfo, InstalledExtension } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { useBackend } from "../../bridge/hooks";
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { TextField } from "../../components/TextField/TextField";
import { confirmAlert } from "../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { Image } from "../../icons/Image";
import { openWindow, showInFinder } from "../actions";
import { useAllCommands } from "../data";
import { navigate } from "../navigation";
import {
  buildShortcutTree,
  CATEGORY_TITLES,
  collectiveState,
  type ShortcutCategory,
  type ShortcutCategoryId,
  type ShortcutFilter,
  type ShortcutGroup,
  type ShortcutStateFilter,
} from "../shortcuts-tree";
import { AliasInput, CommandDetail, CommandHotkey, commandTypeLabel, Disclosure } from "../ui/commands";
import { CardEmpty } from "../ui/layout";
import { MenuButton } from "../ui/MenuButton";
import { PageFrame } from "../ui/PageFrame";
import { chooseFiles } from "../ui/prompt";
import "./shortcuts.css";

const CATEGORY_OPTIONS: { value: ShortcutCategoryId | "all"; title: string }[] = [
  { value: "all", title: "All Categories" },
  ...(Object.keys(CATEGORY_TITLES) as ShortcutCategoryId[]).map((id) => ({ value: id, title: CATEGORY_TITLES[id] })),
];

const STATE_OPTIONS: { value: ShortcutStateFilter; title: string }[] = [
  { value: "all", title: "All Commands" },
  { value: "hotkey-set", title: "Hotkey Set" },
  { value: "alias-set", title: "Alias Set" },
  { value: "enabled", title: "Enabled" },
  { value: "disabled", title: "Disabled" },
];

function filterLabel(filter: ShortcutFilter): string {
  const parts = [filter.category === "all" ? null : CATEGORY_TITLES[filter.category], filter.state === "all" ? null : STATE_OPTIONS.find((o) => o.value === filter.state)?.title].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Filter";
}

async function setEnabled(commands: readonly CommandInfo[], enabled: boolean) {
  try {
    await Promise.all(commands.filter((c) => c.enabled !== enabled).map((c) => backend.call("commands.setPrefs", { id: c.id, prefs: { enabled } })));
  } catch (error) {
    showFailureToast(enabled ? "Could not enable commands" : "Could not disable commands", error);
  }
}

async function uninstall(extension: InstalledExtension) {
  const confirmed = await confirmAlert({
    title: `Uninstall ${extension.title}?`,
    message: "Its commands, preferences and stored data are removed from this Mac.",
    primaryAction: { title: "Uninstall", style: "destructive" },
  });
  if (!confirmed) return;
  try {
    await backend.call("extensions.uninstall", { name: extension.name });
    showToast({ style: "success", title: `Uninstalled ${extension.title}` });
  } catch (error) {
    showFailureToast("Could not uninstall extension", error);
  }
}

function CommandRow({ command, allCommands, nested, extension }: { command: CommandInfo; allCommands: readonly CommandInfo[]; nested: boolean; extension?: InstalledExtension }) {
  const [open, setOpen] = useState(false);
  const manifest = extension?.commands.find((c) => command.id === `ext:${extension.name}.${c.name}`);
  return (
    <div className="sc-s-item sc-s-tree__command">
      <div className="sc-s-tree__row" data-nested={nested || undefined} data-enabled={command.enabled || undefined}>
        <button type="button" className="sc-s-tree__name" aria-expanded={open} onClick={() => setOpen(!open)} title={command.subtitle && command.kind === "app" ? command.subtitle : undefined}>
          <Image source={command.icon} size={16} />
          <span className="sc-truncate">{command.title}</span>
          {command.needsPreferences && (
            <span className="sc-s-badge" data-tone="warning">
              Setup
            </span>
          )}
        </button>
        <span className="sc-s-tree__type sc-truncate">{commandTypeLabel(command)}</span>
        <span className="sc-s-tree__alias">
          <AliasInput command={command} />
        </span>
        <CommandHotkey command={command} commands={allCommands} />
        <Checkbox checked={command.enabled} onChange={(enabled) => void setEnabled([command], enabled)} />
      </div>
      {open && (
        <CommandDetail
          command={command}
          extensionName={extension?.name}
          preferences={manifest?.preferences}
          footer={command.kind === "app" && command.subtitle ? <p className="sc-s-command-detail__description">{command.subtitle}</p> : undefined}
        />
      )}
    </div>
  );
}

function GroupRows({ group, allCommands, extension, forceOpen }: { group: ShortcutGroup; allCommands: readonly CommandInfo[]; extension?: InstalledExtension; forceOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const expanded = open || forceOpen;
  const menu = [
    ...(group.route ? [{ id: "open", title: "Open Settings", icon: "cog-16" }] : []),
    ...(extension?.path ? [{ id: "finder", title: "Show in Finder", icon: "finder-16" }] : []),
    ...(extension ? [{ id: "uninstall", title: "Uninstall…", icon: "trash-16", style: "destructive" as const }] : []),
  ];
  return (
    <>
      <div className="sc-s-item sc-s-tree__group">
        <button type="button" className="sc-s-tree__group-toggle" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
          <Image source={group.icon} size={16} />
          <span className="sc-truncate">{group.title}</span>
          <span className="sc-s-tree__count">{group.commands.length}</span>
          <Disclosure open={expanded} duration={300} />
        </button>
        <span className="sc-s-tree__group-menu">
          {menu.length > 0 && (
            <MenuButton
              icon="ellipsis-16"
              label={`${group.title} actions`}
              sections={[{ items: menu }]}
              onSelect={(item) => {
                if (item.id === "open" && group.route) navigate(group.route);
                if (item.id === "finder" && extension?.path) showInFinder(extension.path);
                if (item.id === "uninstall" && extension) void uninstall(extension);
              }}
              width={200}
            />
          )}
        </span>
        <Checkbox checked={collectiveState(group.commands)} onChange={(enabled) => void setEnabled(group.commands, enabled)} />
      </div>
      {expanded && group.commands.map((command) => <CommandRow key={command.id} command={command} allCommands={allCommands} nested extension={extension} />)}
    </>
  );
}

function CategoryCard({
  category,
  allCommands,
  extensions,
  filtering,
}: {
  category: ShortcutCategory;
  allCommands: readonly CommandInfo[];
  extensions: readonly InstalledExtension[];
  filtering: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sc-s-card sc-s-tree" data-setting-id={category.id}>
      <div className="sc-s-tree__category">
        <button type="button" className="sc-s-tree__category-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>{category.title}</span>
          <Disclosure open={open} duration={300} />
        </button>
        <Checkbox checked={collectiveState(category.commands)} onChange={(enabled) => void setEnabled(category.commands, enabled)} />
      </div>
      {open && (
        <>
          <div className="sc-s-tree__header" aria-hidden="true">
            <span>Name</span>
            <span>Type</span>
            <span>Alias</span>
            <span>Hotkey</span>
            <span />
          </div>
          {category.groups
            ? category.groups.map((group) => <GroupRows key={group.id} group={group} allCommands={allCommands} extension={extensions.find((e) => e.name === group.id)} forceOpen={filtering} />)
            : category.commands.map((command) => <CommandRow key={command.id} command={command} allCommands={allCommands} nested={false} />)}
        </>
      )}
    </div>
  );
}

async function installLocalExtension() {
  try {
    const picked = await chooseFiles({ canChooseFiles: false, canChooseDirectories: true, title: "Choose an Extension Folder", prompt: "Install" });
    if (!picked?.[0]) return;
    const toast = showToast({ style: "animated", title: "Installing extension…" });
    try {
      const extension = await backend.call("extensions.install", { source: "local", path: picked[0] });
      toast.update({ style: "success", title: `Installed ${extension.title}` });
    } catch (error) {
      toast.update({ style: "failure", title: "Could not install extension", message: error instanceof Error ? error.message : undefined });
    }
  } catch (error) {
    showFailureToast("Could not open the folder picker", error);
  }
}

/** Settings → Shortcuts: every command with its alias, hotkey and enabled state (§8.6, §13.6). */
export function ShortcutsPage() {
  const { data: commands, isLoading } = useAllCommands();
  const { data: extensions } = useBackend("extensions.list", undefined);
  const [filter, setFilter] = useState<ShortcutFilter>({ query: "", category: "all", state: "all" });
  const tree = useMemo(() => buildShortcutTree(commands ?? [], extensions ?? [], filter), [commands, extensions, filter]);
  const storeCommand = commands?.find((c) => c.kind === "builtin" && c.mode === "view" && /store/i.test(c.id));
  const filtering = Boolean(filter.query.trim()) || filter.state !== "all";

  const actions = (
    <>
      <span className="sc-s-shortcuts-search">
        <TextField
          size="small"
          leadingIcon="magnifying-glass-16"
          value={filter.query}
          onChange={(query) => setFilter({ ...filter, query })}
          placeholder="Search commands…"
          aria-label="Search commands"
        />
      </span>
      <MenuButton
        variant="ghost"
        icon="filter-16"
        label="Filter Commands"
        width={220}
        searchable={false}
        sections={[
          { title: "Category", items: CATEGORY_OPTIONS.map((o) => ({ id: `category:${o.value}`, title: o.title, checked: filter.category === o.value })) },
          { title: "Show", items: STATE_OPTIONS.map((o) => ({ id: `state:${o.value}`, title: o.title, checked: filter.state === o.value })) },
        ]}
        onSelect={(item) => {
          const [kind, value] = item.id.split(":");
          if (kind === "category") setFilter({ ...filter, category: value as ShortcutFilter["category"] });
          else setFilter({ ...filter, state: value as ShortcutStateFilter });
        }}
      >
        {filterLabel(filter)}
      </MenuButton>
      <MenuButton
        icon="plus-16"
        label="Add Extension"
        width={240}
        sections={[
          {
            items: [...(storeCommand ? [{ id: "store", title: "Browse Store", icon: "store-16" }] : []), { id: "local", title: "Install Local Extension…", icon: "folder-16" }],
          },
        ]}
        onSelect={(item) => {
          if (item.id === "store" && storeCommand) openWindow("main", `command:${storeCommand.id}`);
          if (item.id === "local") void installLocalExtension();
        }}
      />
    </>
  );

  return (
    <PageFrame title="Shortcuts" titleMode="always" actions={actions}>
      {tree.length ? (
        tree.map((category) => <CategoryCard key={category.id} category={category} allCommands={commands ?? []} extensions={extensions ?? []} filtering={filtering} />)
      ) : (
        <div className="sc-s-card">
          <CardEmpty title={isLoading ? "Loading Commands…" : "No Commands Found"} description={isLoading ? undefined : "Try a different search or filter."} />
        </div>
      )}
    </PageFrame>
  );
}
