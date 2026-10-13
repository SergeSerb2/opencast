import type { AppContext, ToolProvider } from "../../context";
export function builtinTools(ctx: AppContext): ToolProvider {
  const definition = (
    name: string,
    title: string,
    description: string,
    properties: Record<string, unknown> = {},
    required: string[] = [],
    requiresConfirmation = false,
  ) => ({
    name,
    title,
    description,
    toolset: "builtin",
    toolsetTitle: "System",
    inputSchema: { type: "object", properties, required },
    requiresConfirmation,
  });
  return {
    id: "builtin",
    async list() {
      return [
        definition(
          "datetime.now",
          "Current Date and Time",
          "Get the current local date, time, and time zone.",
        ),
        definition(
          "clipboard.read",
          "Read Clipboard",
          "Read the user's current clipboard as text.",
        ),
        definition(
          "selection.read",
          "Read Selected Text",
          "Read the selected text in the user's focused app.",
        ),
        definition(
          "calendar.events",
          "Read Calendar Events",
          "List events between two ISO-8601 dates.",
          { from: { type: "string" }, to: { type: "string" } },
          ["from", "to"],
        ),
        definition(
          "system.notification",
          "Show Notification",
          "Display a notification on the user's Mac.",
          { title: { type: "string" }, body: { type: "string" } },
          ["title"],
          true,
        ),
      ];
    },
    async call(name, args, { signal }) {
      signal?.throwIfAborted();
      if (name === "datetime.now")
        return {
          iso: new Date().toISOString(),
          local: new Date().toLocaleString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      if (name === "clipboard.read") {
        const value = await ctx.native.call("clipboard.read", undefined);
        return {
          text:
            value?.text ??
            (value?.primary.kind === "text" ? value.primary.text : ""),
        };
      }
      if (name === "selection.read")
        return {
          text: (await ctx.native.call("input.selectedText", undefined)) ?? "",
        };
      if (name === "calendar.events") {
        if (
          typeof args.from !== "string" ||
          typeof args.to !== "string" ||
          !Number.isFinite(Date.parse(args.from)) ||
          !Number.isFinite(Date.parse(args.to)) ||
          Date.parse(args.from) > Date.parse(args.to)
        )
          throw new Error("Calendar events require a valid from/to date range");
        return ctx.native.call("calendar.events", {
          from: args.from,
          to: args.to,
        });
      }
      if (name === "system.notification") {
        if (typeof args.title !== "string" || !args.title)
          throw new Error("Notification requires a title");
        await ctx.native.call("system.notification", {
          title: args.title,
          body: typeof args.body === "string" ? args.body : undefined,
        });
        return { shown: true };
      }
      throw new Error(`Unknown system tool ${name}`);
    },
  };
}
