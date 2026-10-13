import { RpcErrorCode, type CommandInfo, type ExtensionCommandManifest, type ExtensionPreference, type InstalledExtension, type StoreExtension } from "@opencast/protocol";
import { RpcError } from "../../errors";
import { ALL_COMMANDS } from "../fixtures/commands";
import { EXTENSIONS } from "../fixtures/content";
import { STANDUP_ICON, STORE_CATALOG, tileIconUrl, type CatalogItem } from "./store-catalog";
import type { MockArea, MockContext } from "./types";

const DAY = 86_400_000;
const PAGE_SIZE = 10;
const INSTALL_ROOT = "/Users/me/Library/Application Support/OpenCast/extensions";
/** Updates of these extensions fail, so the update results show every outcome. */
const FAILING_UPDATES = new Map([["spotify-player", "The Store didn't respond in time (502). Try again in a few minutes."]]);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function notFound(what: string): never {
  throw new RpcError({ code: RpcErrorCode.NotFound, message: `${what} not found` });
}

function findListing(idOrSlug: string): CatalogItem | undefined {
  const parts = idOrSlug.replace(/^https:\/\/www\.raycast\.com\//, "").split("/");
  const [owner, name] = parts.length === 2 ? parts : [undefined, idOrSlug];
  return STORE_CATALOG.find(({ listing }) => listing.id === idOrSlug || (listing.name === name && (!owner || owner === (listing.owner?.handle ?? listing.author.handle))));
}

function fromListing(item: CatalogItem, overrides: Partial<InstalledExtension> = {}): InstalledExtension {
  const { listing } = item;
  const installedAt = Date.now();
  return {
    name: listing.name,
    id: listing.id,
    title: listing.title,
    description: listing.description,
    author: listing.author.handle,
    owner: listing.owner?.handle,
    icon: item.iconUrl,
    version: listing.version,
    source: "store",
    path: `${INSTALL_ROOT}/${listing.name}`,
    commands: listing.commands.map((c) => ({ name: c.name, title: c.title, description: c.description, mode: c.mode })),
    tools: (listing.tools ?? []).map((t) => ({ name: t.name, title: t.title, description: t.description ?? "" })),
    preferences: item.preferences,
    enabled: true,
    installedAt,
    updatedAt: installedAt,
    ...overrides,
  };
}

function catalog(name: string): CatalogItem {
  return findListing(name) ?? notFound(`Store extension ${name}`);
}

/** A folder picked for Import / Develop becomes a one-command extension. */
function fromFolder(path: string, source: "local" | "development"): InstalledExtension {
  const folder = path.replace(/\/+$/, "").split("/").pop() || "extension";
  const name = folder.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const title = folder.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const now = Date.now();
  return {
    name,
    title,
    description: `Local extension from ${folder}.`,
    author: "me",
    icon: tileIconUrl("code", "#8E95A6", "#4A5060"),
    version: "0.1.0",
    source,
    path,
    commands: [{ name: "index", title: `Open ${title}`, mode: "view" }],
    tools: [],
    preferences: [],
    enabled: true,
    installedAt: now,
    updatedAt: now,
  };
}

/** Installed state at startup: the shared fixtures (GitHub, Weather) plus a few more to fill every section. */
function initialExtensions(): InstalledExtension[] {
  const days = (n: number) => Date.now() - n * DAY;
  const base = EXTENSIONS.map((e): InstalledExtension => {
    const item = catalog(e.name);
    const versions: Record<string, string> = { github: "1.8.0", weather: "2.1.0" };
    return {
      ...e,
      id: item.listing.id,
      author: item.listing.author.handle,
      description: item.listing.description,
      icon: item.iconUrl,
      version: versions[e.name] ?? item.listing.version,
      path: `${INSTALL_ROOT}/${e.name}`,
    };
  });
  return [
    ...base,
    fromListing(catalog("unsplash"), { installedAt: days(41), updatedAt: days(12) }),
    fromListing(catalog("spotify-player"), { version: "3.2.0", installedAt: days(63), updatedAt: days(30) }),
    fromListing(catalog("coffee"), { enabled: false, installedAt: days(90), updatedAt: days(60) }),
    {
      name: "dictionary",
      title: "Dictionary",
      description: "Definitions, synonyms and pronunciations from an offline dictionary.",
      author: "me",
      version: "1.0.0",
      source: "local",
      path: "/Users/me/Extensions/dictionary",
      commands: [{ name: "define-word", title: "Define Word", description: "Look up a word as you type.", mode: "view" }],
      tools: [],
      preferences: [],
      enabled: true,
      installedAt: days(20),
      updatedAt: days(20),
    },
    {
      name: "team-standup",
      title: "Team Standup",
      description: "Post your daily update to the team channel and get a reminder before standup.",
      author: "me",
      icon: STANDUP_ICON,
      version: "0.3.0",
      source: "development",
      path: "/Users/me/Developer/team-standup",
      commands: [
        { name: "post-update", title: "Post Standup Update", description: "Yesterday, today and blockers in one form.", mode: "view" },
        { name: "reminder", title: "Standup Reminder", description: "Minutes until standup in the menu bar.", mode: "menu-bar", interval: "1m", disabledByDefault: true },
      ],
      tools: [{ name: "summarize-week", title: "Summarize Week", description: "Summarize this week's updates." }],
      preferences: [{ name: "channel", title: "Channel", type: "textfield", required: false, default: "#standup" }],
      enabled: true,
      installedAt: days(2),
      updatedAt: Date.now() - 3_600_000,
    },
  ];
}

/** Mock backend for the Store catalog and installed extensions (install, update, enable, preferences). */
export function createStoreMock(ctx: MockContext): MockArea {
  const installed = initialExtensions();
  const prefs = new Map<string, Record<string, unknown>>();
  const knownIds = new Set(ALL_COMMANDS.map((c) => c.id));

  const extension = (name: string) => installed.find((e) => e.name === name) ?? notFound(`Extension ${name}`);
  const definitions = (ext: InstalledExtension, command?: string): ExtensionPreference[] => [...ext.preferences, ...(command ? (ext.commands.find((c) => c.name === command)?.preferences ?? []) : [])];
  const values = (ext: InstalledExtension, command?: string) => {
    const stored = { ...prefs.get(`${ext.name}/`), ...(command ? prefs.get(`${ext.name}/${command}`) : undefined) };
    return Object.fromEntries(definitions(ext, command).map((d) => [d.name, stored[d.name] ?? d.default]));
  };
  const missingRequired = (ext: InstalledExtension, command?: string) => {
    const current = values(ext, command);
    return definitions(ext, command)
      .filter((d) => d.required && (current[d.name] === undefined || current[d.name] === ""))
      .map((d) => d.name);
  };

  const commandInfo = (ext: InstalledExtension, manifest: ExtensionCommandManifest): CommandInfo => ({
    id: `ext:${ext.name}.${manifest.name}`,
    kind: "extension",
    title: manifest.title,
    subtitle: ext.title,
    typeLabel: "Command",
    icon: ext.icon ?? "box-16",
    mode: manifest.mode,
    enabled: ext.enabled && !manifest.disabledByDefault,
    extensionId: ext.name,
    extensionTitle: ext.title,
    description: manifest.description,
    interval: manifest.interval,
    needsPreferences: missingRequired(ext, manifest.name).length > 0,
    installedAt: ext.installedAt,
  });

  const removeCommands = (name: string) => {
    const list = ctx.commands;
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === "extension" && list[i].extensionId === name) list.splice(i, 1);
  };
  const addCommands = (ext: InstalledExtension) => {
    removeCommands(ext.name);
    ctx.commands?.push(...ext.commands.map((manifest) => commandInfo(ext, manifest)));
  };
  const changed = (commandsChanged: boolean) => {
    ctx.events.emit("extensions.changed", {});
    if (commandsChanged) ctx.events.emit("commands.changed", { reason: "extensions" });
  };
  const upsert = (ext: InstalledExtension) => {
    const index = installed.findIndex((e) => e.name === ext.name);
    if (index === -1) installed.push(ext);
    else installed[index] = ext;
    addCommands(ext);
    changed(true);
    return ext;
  };

  const withInstallState = (listing: StoreExtension): StoreExtension => {
    const local = installed.find((e) => e.name === listing.name && e.path);
    return { ...listing, installed: Boolean(local), installedVersion: local?.version };
  };

  return {
    // Commands of the extra extensions installed at startup that the shared fixtures don't list.
    commands: installed.flatMap((ext) => ext.commands.map((manifest) => commandInfo(ext, manifest))).filter((c) => !knownIds.has(c.id)),
    handlers: {
      "extensions.list": () => installed,

      "extensions.store.search": async ({ query, category, page = 1 }) => {
        await delay(query ? 160 : 90);
        const q = query?.trim().toLowerCase() ?? "";
        const matches = STORE_CATALOG.map((c) => c.listing).filter((listing) => {
          const inCategory = !category || (category === "AI Extensions" ? Boolean(listing.tools?.length) : listing.categories.includes(category));
          const text = [listing.title, listing.name, listing.description, listing.author.name, ...listing.categories].join(" ").toLowerCase();
          return inCategory && (!q || q.split(/\s+/).every((word) => text.includes(word)));
        });
        const start = (page - 1) * PAGE_SIZE;
        return { items: matches.slice(start, start + PAGE_SIZE).map(withInstallState), hasMore: start + PAGE_SIZE < matches.length };
      },

      "extensions.store.get": async ({ idOrSlug }) => {
        await delay(200);
        const item = findListing(idOrSlug) ?? notFound(`Store extension ${idOrSlug}`);
        return { ...withInstallState(item.listing), readme: item.readme };
      },

      "extensions.install": async (params) => {
        if (params.source === "local") {
          await delay(700);
          return upsert(fromFolder(params.path, "local"));
        }
        await delay(1400);
        const item = findListing(params.idOrSlug) ?? notFound(`Store extension ${params.idOrSlug}`);
        const previous = installed.find((e) => e.name === item.listing.name);
        return upsert(fromListing(item, previous ? { enabled: previous.enabled, installedAt: previous.installedAt } : {}));
      },

      "extensions.develop": async ({ path }) => {
        await delay(700);
        return upsert(fromFolder(path, "development"));
      },

      "extensions.uninstall": async ({ name }) => {
        await delay(450);
        const index = installed.findIndex((e) => e.name === name);
        if (index === -1) notFound(`Extension ${name}`);
        installed.splice(index, 1);
        for (const key of [...prefs.keys()]) if (key.startsWith(`${name}/`)) prefs.delete(key);
        removeCommands(name);
        changed(true);
      },

      "extensions.update": async ({ name }) => {
        const targets = name ? [extension(name)] : installed.filter((e) => e.source === "store" && e.path);
        const updated: string[] = [];
        for (const ext of targets.filter((e) => e.source === "store")) {
          await delay(500);
          const failure = FAILING_UPDATES.get(ext.name);
          if (failure) throw new RpcError({ code: RpcErrorCode.Upstream, message: failure });
          const latest = catalog(ext.name).listing.version;
          if (!latest || latest === ext.version) continue;
          ext.version = latest;
          ext.updatedAt = Date.now();
          updated.push(ext.name);
        }
        if (updated.length) changed(false);
        return { updated };
      },

      "extensions.setEnabled": ({ name, enabled }) => {
        const ext = extension(name);
        ext.enabled = enabled;
        for (const command of ctx.commands ?? []) {
          if (command.kind !== "extension" || command.extensionId !== name) continue;
          const manifest = ext.commands.find((c) => command.id === `ext:${name}.${c.name}`);
          command.enabled = enabled && !manifest?.disabledByDefault;
        }
        changed(true);
      },

      "extensions.getPreferences": ({ name, command }) => {
        const ext = extension(name);
        return { values: values(ext, command), missingRequired: missingRequired(ext, command) };
      },

      "extensions.setPreferences": ({ name, command, values: next }) => {
        const ext = extension(name);
        const key = `${name}/${command ?? ""}`;
        prefs.set(key, { ...prefs.get(key), ...next });
        for (const info of ctx.commands ?? []) {
          if (info.kind === "extension" && info.extensionId === name) info.needsPreferences = missingRequired(ext, info.id.slice(`ext:${name}.`.length)).length > 0;
        }
        changed(true);
      },
    },
  };
}
