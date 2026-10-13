import { RpcErrorCode } from "@surgecast/protocol";
import type { Snippet } from "@surgecast/protocol";
import type { AppContext, Service } from "../../context";
import {
  background,
  importRows,
  list,
  nonempty,
  observeCollection,
  requireEntity,
  save,
  stamp,
} from "./shared";
import { clipboardItems } from "./clipboard";
import {
  parseTemplate,
  renderTemplate,
  templateArguments,
  type TemplateContext,
} from "./placeholders";
import { calculator } from "./calculator";
import { RpcError } from "../../util/errors";

export function templateContext(
  ctx: AppContext,
  options: Partial<TemplateContext> = {},
): TemplateContext {
  return {
    clipboard: async (offset) => {
      if (!offset) {
        try {
          const snapshot = await ctx.native.call("clipboard.read", undefined);
          if (snapshot)
            return snapshot.concealed || snapshot.transient
              ? ""
              : (snapshot.text ??
                  (snapshot.primary.kind === "text"
                    ? snapshot.primary.text
                    : snapshot.primary.kind === "color"
                      ? snapshot.primary.hex
                      : snapshot.primary.kind === "file"
                        ? snapshot.primary.paths.join("\n")
                        : "Image"));
        } catch {
          /* History remains usable without the host. */
        }
      }
      const item = clipboardItems(ctx, offset + 1)[offset];
      return item?.text ?? item?.title ?? "";
    },
    selection: async () =>
      (await ctx.native.call("input.selectedText", undefined)) ?? "",
    calculator: async (expression) =>
      (await calculator(ctx).evaluate(expression))?.copyValue ??
      "Invalid expression",
    snippet: async (name) => {
      const matches = list<Snippet>(ctx, "snippets").filter(
        (s) => s.name === name,
      );
      if (matches.length !== 1)
        throw RpcError.invalidParams(
          `Snippet name must identify exactly one snippet: ${name}`,
        );
      const snippet = matches[0];
      if (
        parseTemplate(snippet.text).some((t) =>
          ["snippet", "argument"].includes(t.kind),
        )
      )
        throw RpcError.invalidParams(
          "Referenced snippets cannot contain snippets or arguments",
        );
      return (
        await renderTemplate(
          snippet.text,
          templateContext(ctx, { snippet: undefined }),
        )
      ).text;
    },
    ...options,
  };
}
function validateSnippet(value: Snippet): void {
  nonempty(value.name, "Snippet name");
  if (typeof value.text !== "string")
    throw RpcError.invalidParams("Snippet text must be a string");
  if (
    value.keyword !== undefined &&
    (typeof value.keyword !== "string" || /\s/.test(value.keyword))
  )
    throw RpcError.invalidParams("Snippet keywords cannot contain whitespace");
  // Validation also enforces the cursor and three-argument limits.
  templateArguments(value.text);
}
export const snippetsService: Service = {
  name: "core.snippets",
  register(ctx) {
    let configuration: string | undefined;
    const keywords = async () => {
      const items = list<Snippet>(ctx, "snippets")
        .filter((s) => !!s.keyword)
        .map((s) => ({ id: s.id, keyword: s.keyword! }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const params = {
          // No keywords → no keyboard monitoring (and no Accessibility prompt).
          enabled: ctx.settings.get("snippets.autoExpansionEnabled") && items.length > 0,
          ignoredBundleIds: ctx.settings.get("snippets.disabledApplications"),
          keywords: items,
          expandWithinWords: ctx.settings.get("snippets.expandWithinWords"),
          expansionMode: ctx.settings.get("snippets.expansionMode"),
          injectionDelay: ctx.settings.get("snippets.injectionDelay"),
          responseTime: ctx.settings.get("snippets.responseTime"),
          completionSound: ctx.settings.get("snippets.completionSound"),
          overrideSystemSnippets: ctx.settings.get("snippets.overrideSystemSnippets"),
      };
      const next = JSON.stringify(params);
      if (configuration === next) return;
      configuration = next;
      try {
        await ctx.native.call("snippets.setKeywords", params);
      } catch (error) {
        if (configuration === next) configuration = undefined;
        if (error instanceof RpcError && error.code === RpcErrorCode.PermissionDenied) {
          ctx.log.info("Snippet expansion is waiting for the Accessibility permission");
          return;
        }
        throw error;
      }
    };
    ctx.onReady(keywords);
    ctx.onShutdown(
      ctx.native.on("permissions.changed", ({ kind, status }) => {
        if (kind === "accessibility" && status === "granted")
          background(ctx, keywords(), "Snippet keywords");
      }),
    );
    observeCollection(ctx, "snippets", () =>
      background(ctx, keywords(), "Snippet keywords"),
    );
    ctx.onShutdown(
      ctx.settings.onChange((key) => {
        if (key.startsWith("snippets."))
          background(ctx, keywords(), "Snippet keywords");
      }),
    );
    const render = (
      text: string,
      arguments_?: Record<string, string>,
      self?: string,
    ) =>
      renderTemplate(
        text,
        templateContext(ctx, {
          arguments: arguments_,
          snippet: async (name) => {
            if (
              self &&
              requireEntity<Snippet>(ctx, "snippets", self).name === name
            )
              throw RpcError.invalidParams("A snippet cannot reference itself");
            return templateContext(ctx).snippet!(name);
          },
        }),
      );
    const trackUse = (id: string) => {
      const current = ctx.entities.get<Snippet>("snippets", id)?.data;
      if (current) save(ctx, "snippets", {
        ...current, copyCount: (current.copyCount ?? 0) + 1, lastUsedAt: Date.now(),
      });
    };
    const use = async (
      id: string,
      arguments_: Record<string, string> | undefined,
      paste: boolean,
    ) => {
      const snippet = requireEntity<Snippet>(ctx, "snippets", id);
      const resolved = await render(snippet.text, arguments_, id);
      const content = { kind: "text" as const, text: resolved.text };
      if (paste) {
        await ctx.native.call("input.paste", {
          content,
          restoreClipboard: true,
        });
        if (resolved.cursorOffset)
          for (let i = 0; i < resolved.cursorOffset; i++)
            await ctx.native.call("input.pressKeys", { key: "arrowLeft" });
      } else await ctx.native.call("clipboard.write", { content });
      trackUse(id);
    };
    ctx.native.serve("snippets.resolve", async ({ id }) => {
      const snippet = ctx.entities.get<Snippet>("snippets", id)?.data;
      if (!snippet || !ctx.settings.get("snippets.autoExpansionEnabled"))
        return null;
      const resolved = await render(snippet.text, undefined, id);
      trackUse(id);
      return { text: resolved.text, cursorOffset: resolved.cursorOffset };
    });
    ctx.rpc.handleAll({
      "snippets.list": ({ query = "" }) =>
        list<Snippet>(ctx, "snippets")
          .filter((s) =>
            [s.name, s.keyword, s.text, ...(s.tags ?? [])]
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .sort(
            (a, b) =>
              Number(!!b.pinned) - Number(!!a.pinned) ||
              a.name.localeCompare(b.name),
          ),
      "snippets.get": ({ id }) =>
        ctx.entities.get<Snippet>("snippets", id)
          ? requireEntity<Snippet>(ctx, "snippets", id)
          : null,
      "snippets.create": (params) => {
        const snippet = { ...params, ...stamp() };
        validateSnippet(snippet);
        return save(ctx, "snippets", snippet);
      },
      "snippets.update": ({ id, patch }) => {
        const snippet = {
          ...requireEntity<Snippet>(ctx, "snippets", id),
          ...patch,
          id,
        };
        validateSnippet(snippet);
        return save(ctx, "snippets", snippet);
      },
      "snippets.delete": ({ id }) => {
        ctx.entities.delete("snippets", id);
      },
      "snippets.render": ({ text, arguments: args }) => render(text, args),
      "snippets.paste": ({ id, arguments: args }) => use(id, args, true),
      "snippets.copy": ({ id, arguments: args }) => use(id, args, false),
      "snippets.import": ({ json }) => {
        const rows = importRows(json, "snippets");
        let imported = 0;
        let skipped = 0;
        for (const row of rows) {
          try {
            const r = row as Record<string, unknown>;
            const snippet: Snippet = {
              ...stamp(),
              name: nonempty(r.name ?? r.title, "Snippet name"),
              text: typeof r.text === "string" ? r.text : "",
              keyword: typeof r.keyword === "string" ? r.keyword : undefined,
              pinned: !!r.pinned,
              tags: Array.isArray(r.tags)
                ? r.tags.filter((s): s is string => typeof s === "string")
                : [],
            };
            validateSnippet(snippet);
            save(ctx, "snippets", snippet);
            imported++;
          } catch {
            skipped++;
          }
        }
        return { imported, skipped };
      },
      "snippets.export": () => ({
        json: JSON.stringify(
          {
            schemaVersion: 1,
            snippets: list<Snippet>(ctx, "snippets").map((s) => ({
              ...s,
              title: s.name,
              createdAt: new Date(s.createdAt).toISOString(),
              updatedAt: new Date(s.updatedAt).toISOString(),
            })),
          },
          null,
          2,
        ),
      }),
    });
  },
};
