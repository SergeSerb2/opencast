import type {
  CommandArgument,
  CommandInfo,
  Quicklink,
} from "@surgecast/protocol";
import type { AppContext, Service } from "../../context";
import {
  importRows,
  list,
  nonempty,
  observeCollection,
  requireEntity,
  save,
  stamp,
  expandPath,
} from "./shared";
import {
  renderTemplate,
  templateArguments,
  type PlaceholderArgument,
} from "./placeholders";
import { templateContext } from "./snippets";
import { RpcError } from "../../util/errors";

export const DEFAULT_SEARCHES: [string, string, string][] = [
  ["google", "Search Google", "https://www.google.com/search?q={query}"],
  ["duckduckgo", "Search DuckDuckGo", "https://duckduckgo.com/?q={query}"],
  ["bing", "Search Bing", "https://www.bing.com/search?q={query}"],
  [
    "wikipedia",
    "Search Wikipedia",
    "https://en.wikipedia.org/w/index.php?search={query}",
  ],
  ["github", "Search GitHub", "https://github.com/search?q={query}"],
  [
    "youtube",
    "Search YouTube",
    "https://www.youtube.com/results?search_query={query}",
  ],
];
export function commandArguments(
  args: PlaceholderArgument[],
): CommandArgument[] {
  return args.map((a) => ({
    name: a.name,
    type: a.options?.length ? "dropdown" : "text",
    placeholder: a.name === "query" ? "Search Query" : a.name,
    required: a.default === undefined,
    default: a.default,
    data: a.options?.map((value) => ({ title: value, value })),
  }));
}
export function quicklinkIcon(
  ctx: AppContext,
  link: Quicklink,
  appPath?: string,
) {
  if (link.icon) return link.icon;
  if (appPath || link.openWith?.startsWith("/"))
    return { fileIcon: appPath ?? link.openWith! };
  try {
    const url = new URL(link.link);
    const provider = ctx.settings.get("advanced.faviconProvider");
    if (["http:", "https:"].includes(url.protocol) && provider !== "none") {
      const domain = url.hostname === "youtu.be" ? "youtube.com" : url.hostname;
      return provider === "google"
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
        : `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
    }
  } catch {
    /* Local links use a command tile. */
  }
  return {
    tile: {
      glyph: "link-16",
      background: ["#FF6363", "#E5484D"] as [string, string],
    },
  };
}
function validate(value: Quicklink): void {
  nonempty(value.name, "Quicklink name");
  nonempty(value.link, "Quicklink target");
  templateArguments(value.link, true);
}
export async function openQuicklink(
  ctx: AppContext,
  link: Quicklink,
  query?: string,
  args?: Record<string, string>,
): Promise<void> {
  if (
    !query &&
    !args &&
    ctx.settings.get("quicklinks.passSelectedTextAsArgument")
  )
    query =
      (await ctx.native.call("input.selectedText", undefined)) ?? undefined;
  const resolved = await renderTemplate(
    link.link,
    templateContext(ctx, {
      url: !/^(\/|~\/)/.test(link.link),
      query,
      arguments: args,
    }),
  );
  if (/^(surgecast|raycast):\/\//i.test(resolved.text)) {
    await ctx.rpc.invoke(
      "deeplink.open",
      { url: resolved.text },
      { connectionId: "quicklink", signal: new AbortController().signal },
    );
  } else if (
    /^(\/|~\/)/.test(resolved.text) ||
    resolved.text.startsWith("file:")
  ) {
    const path = resolved.text.startsWith("file:")
      ? decodeURIComponent(new URL(resolved.text).pathname)
      : expandPath(resolved.text);
    await ctx.native.call("open.path", { path, app: link.openWith });
  } else {
    let url: URL;
    try {
      url = new URL(resolved.text);
    } catch {
      throw RpcError.invalidParams(
        "Quicklink target must be an absolute URL or path",
      );
    }
    if (["javascript:", "data:"].includes(url.protocol))
      throw RpcError.invalidParams("This URL scheme cannot be opened");
    await ctx.native.call("open.url", { url: url.href, app: link.openWith });
  }
  save(ctx, "quicklinks", { ...link, openCount: (link.openCount ?? 0) + 1 });
}
export const quicklinksService: Service = {
  name: "core.quicklinks",
  register(ctx) {
    ctx.onReady(() => {
      if (ctx.entities.get("localState", "default-quicklinks")) return;
      if (!ctx.entities.count("quicklinks"))
        for (const [id, name, link] of DEFAULT_SEARCHES)
          save(ctx, "quicklinks", { ...stamp(), id: `web-${id}`, name, link });
      ctx.entities.put("localState", "default-quicklinks", { seeded: true });
      ctx.commands.invalidate("quicklinks");
    });
    observeCollection(ctx, "quicklinks", () =>
      ctx.commands.invalidate("quicklinks"),
    );
    ctx.onShutdown(
      ctx.native.on("apps.changed", () =>
        ctx.commands.invalidate("quicklinks"),
      ),
    );
    ctx.onShutdown(
      ctx.settings.onChange((key) => {
        if (key === "advanced.faviconProvider")
          ctx.commands.invalidate("quicklinks");
      }),
    );
    ctx.commands.registerProvider({
      id: "quicklinks",
      list: async () => {
        const links = list<Quicklink>(ctx, "quicklinks");
        const apps = links.some((l) => l.openWith)
          ? await ctx.native.call("apps.list", {})
          : [];
        return links.map(
          (link) =>
            ({
              id: `quicklink:${link.id}`,
              kind: "quicklink",
              title: link.name,
              subtitle: link.link,
              typeLabel: "Quicklink",
              mode: "no-view",
              enabled: true,
              icon: quicklinkIcon(
                ctx,
                link,
                apps.find(
                  (app) =>
                    app.bundleId === link.openWith ||
                    app.path === link.openWith,
                )?.path,
              ),
              keywords: link.tags,
              arguments: commandArguments(templateArguments(link.link, true)),
              acceptsFallbackText:
                templateArguments(link.link, true).length > 0,
            }) satisfies CommandInfo,
        );
      },
      launch: async (command, request) => {
        const link = requireEntity<Quicklink>(
          ctx,
          "quicklinks",
          command.id.slice(10),
        );
        await openQuicklink(ctx, link, request.fallbackText, request.arguments);
        return { kind: "done", closeWindow: true };
      },
    });
    ctx.rpc.handleAll({
      "quicklinks.list": ({ query = "" }) =>
        list<Quicklink>(ctx, "quicklinks").filter((q) =>
          [q.name, q.link, ...(q.tags ?? [])]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
      "quicklinks.create": (params) => {
        const link = { ...params, ...stamp() };
        validate(link);
        return save(ctx, "quicklinks", link);
      },
      "quicklinks.update": ({ id, patch }) => {
        const link = {
          ...requireEntity<Quicklink>(ctx, "quicklinks", id),
          ...patch,
          id,
        };
        validate(link);
        return save(ctx, "quicklinks", link);
      },
      "quicklinks.delete": ({ id }) => {
        ctx.entities.delete("quicklinks", id);
      },
      "quicklinks.open": ({ id, query, arguments: args }) =>
        openQuicklink(
          ctx,
          requireEntity<Quicklink>(ctx, "quicklinks", id),
          query,
          args,
        ),
      "quicklinks.resolve": async ({ link, query, arguments: args }) => {
        const rendered = await renderTemplate(
          link,
          templateContext(ctx, {
            url: !/^(\/|~\/)/.test(link),
            query,
            arguments: args,
          }),
        );
        return { url: rendered.text, arguments: rendered.arguments };
      },
      "quicklinks.import": ({ json }) => {
        let imported = 0;
        let skipped = 0;
        for (const row of importRows(json, "quicklinks")) {
          try {
            const r = row as Quicklink;
            const link: Quicklink = {
              ...stamp(),
              name: nonempty(r.name, "Quicklink name"),
              link: nonempty(r.link, "Quicklink target"),
              openWith: typeof r.openWith === "string" ? r.openWith : undefined,
              tags: Array.isArray(r.tags)
                ? r.tags.filter((t) => typeof t === "string")
                : [],
            };
            validate(link);
            save(ctx, "quicklinks", link);
            imported++;
          } catch {
            skipped++;
          }
        }
        return { imported, skipped };
      },
      "quicklinks.export": () => ({
        json: JSON.stringify(
          {
            schemaVersion: 1,
            quicklinks: list<Quicklink>(ctx, "quicklinks").map((link) => ({
              ...link,
              createdAt: new Date(link.createdAt).toISOString(),
              updatedAt: new Date(link.updatedAt).toISOString(),
            })),
          },
          null,
          2,
        ),
      }),
    });
  },
};
