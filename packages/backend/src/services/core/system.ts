import type { CommandInfo, WindowLayout } from "@surgecast/protocol";
import type { Service } from "../../context";
import {
  list,
  nonempty,
  observeCollection,
  requireEntity,
  save,
  stamp,
} from "./shared";
import { SYSTEM_ACTIONS, WINDOW_COMMANDS } from "./native-commands";
import { RpcError } from "../../util/errors";
export const systemService: Service = {
  name: "core.system",
  register(ctx) {
    const apply = (id: string) =>
      ctx.native.call("windows.applyLayout", {
        rect: requireEntity<WindowLayout>(ctx, "windowLayouts", id).rect,
        gap: ctx.settings.get("windowManagement.innerGap"),
        outerGap: ctx.settings.get("windowManagement.outerGap"),
      });
    observeCollection(ctx, "windowLayouts", () =>
      ctx.commands.invalidate("window-layouts"),
    );
    ctx.commands.registerProvider({
      id: "window-layouts",
      list: () =>
        list<WindowLayout>(ctx, "windowLayouts").map(
          (layout) =>
            ({
              id: `window-layout:${layout.id}`,
              kind: "window-layout",
              title: layout.name,
              subtitle: "Window Management",
              typeLabel: "Window Layout",
              mode: "no-view",
              enabled: true,
              icon: layout.icon ?? {
                tile: {
                  glyph: "window-16",
                  background: ["#3B82F6", "#1D4ED8"],
                },
              },
            }) satisfies CommandInfo,
        ),
      launch: async (cmd) => {
        await apply(cmd.id.slice(14));
        return { kind: "done", closeWindow: true };
      },
    });
    ctx.rpc.handleAll({
      "system.run": async ({ action, value }) => {
        if (!SYSTEM_ACTIONS.includes(action as (typeof SYSTEM_ACTIONS)[number]))
          throw RpcError.invalidParams(`Unknown system action: ${action}`);
        if (
          action === "setVolume" &&
          (typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 100)
        )
          throw RpcError.invalidParams(
            "Volume must be a number between 0 and 100",
          );
        await ctx.native.call("system.run", {
          action: action as (typeof SYSTEM_ACTIONS)[number],
          value,
        });
      },
      "windows.run": async ({ command }) => {
        if (!WINDOW_COMMANDS.includes(command))
          throw RpcError.invalidParams(`Unknown window command: ${command}`);
        await ctx.native.call("windows.run", {
          command,
          gap: ctx.settings.get("windowManagement.innerGap"),
        outerGap: ctx.settings.get("windowManagement.outerGap"),
        });
      },
      "windows.layouts.list": () => list<WindowLayout>(ctx, "windowLayouts"),
      "windows.layouts.upsert": (params) => {
        const old = params.id
          ? ctx.entities.get<WindowLayout>("windowLayouts", params.id)?.data
          : undefined;
        const layout: WindowLayout = {
          ...stamp(),
          ...old,
          ...params,
          id: params.id || old?.id || stamp().id,
        };
        nonempty(layout.name, "Layout name");
        const r = layout.rect;
        if (
          !r ||
          ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
          r.x < 0 ||
          r.y < 0 ||
          r.width <= 0 ||
          r.height <= 0 ||
          r.x + r.width > 1 ||
          r.y + r.height > 1
        )
          throw RpcError.invalidParams(
            "Layout must fit within the screen using fractions from 0 to 1",
          );
        return save(ctx, "windowLayouts", layout);
      },
      "windows.layouts.delete": ({ id }) => {
        ctx.entities.delete("windowLayouts", id);
      },
      "windows.layouts.apply": async ({ id }) => {
        await apply(id);
      },
      "calendar.events": ({ from, to }) => {
        if (
          !Number.isFinite(Date.parse(from)) ||
          !Number.isFinite(Date.parse(to)) ||
          Date.parse(from) > Date.parse(to)
        )
          throw RpcError.invalidParams("Invalid calendar date range");
        return ctx.native.call("calendar.events", { from, to });
      },
      "menus.list": async () => {
        const app =
          (await ctx.native.call("apps.previous", undefined)) ??
          (await ctx.native.call("apps.frontmost", undefined));
        return {
          app: app?.name ?? "",
          items: await ctx.native.call("menus.list", {
            bundleId: app?.bundleId,
          }),
        };
      },
      "menus.press": async ({ path }) => {
        const app = await ctx.native.call("apps.previous", undefined);
        await ctx.native.call("menus.press", { path, bundleId: app?.bundleId });
      },
      "hud.show": ({ text }) => ctx.launcher.hud(text),
    });
  },
};
