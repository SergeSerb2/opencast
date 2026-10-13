import type { Theme } from "@surgecast/protocol";
import type { Service } from "../../context";
import { list, nonempty, observeCollection, save, stamp } from "./shared";
import { RpcError } from "../../util/errors";
const palettes: [string, string, "dark" | "light", string[]][] = [
  [
    "surgecast-dark",
    "Surgecast Dark",
    "dark",
    [
      "#000000",
      "#000000",
      "#FFFFFF",
      "#4FA3F8",
      "#FFFFFF",
      "#FFFFFF",
      "#FF6363",
      "#FF9217",
      "#FFC531",
      "#59D499",
      "#56C2FF",
      "#A485FF",
      "#CF2F98",
    ],
  ],
  [
    "surgecast-light",
    "Surgecast Light",
    "light",
    [
      "#FFFFFF",
      "#FFFFFF",
      "#000000",
      "#138AF2",
      "#000000",
      "#000000",
      "#B12424",
      "#C75D07",
      "#F8A300",
      "#006B4F",
      "#138AF2",
      "#6A3DEC",
      "#9A1B6E",
    ],
  ],
  [
    "surgecast-sky",
    "Sky",
    "dark",
    [
      "#0E1C3F",
      "#173036",
      "#D7F0F4",
      "#4FA3F8",
      "#6688FF",
      "#47FFFF",
      "#ED5959",
      "#ED8659",
      "#EDD559",
      "#47FF91",
      "#1A9FFF",
      "#7759ED",
      "#ED59B2",
    ],
  ],
  [
    "surgecast-midnight",
    "Midnight",
    "dark",
    [
      "#070034",
      "#11005B",
      "#FAF0FF",
      "#4FA3F8",
      "#B1A7FF",
      "#F4C4FF",
      "#F84141",
      "#FFC100",
      "#FEFF7F",
      "#63BA89",
      "#6AB7FB",
      "#C58AFA",
      "#FF5DB3",
    ],
  ],
  [
    "surgecast-dawn",
    "Dawn",
    "light",
    [
      "#FFF1F7",
      "#D0C1FF",
      "#120032",
      "#4FA3F8",
      "#602AFF",
      "#5A00FF",
      "#E14848",
      "#E5753C",
      "#B7B400",
      "#00AC5D",
      "#4F80FF",
      "#9454FF",
      "#D756BF",
    ],
  ],
];
export const BUILTIN_THEMES = palettes.map(
  ([id, name, appearance, values]) => ({
    ...stamp(),
    id,
    name,
    appearance,
    builtin: true,
    colors: Object.fromEntries(
      [
        "background",
        "backgroundSecondary",
        "text",
        "accent",
        "selection",
        "loader",
        "red",
        "orange",
        "yellow",
        "green",
        "blue",
        "purple",
        "magenta",
      ].map((key, index) => [key, values[index]]),
    ) as Theme["colors"],
  }),
);
export function validateTheme(theme: Theme): void {
  nonempty(theme.name, "Theme name");
  if (
    !["dark", "light"].includes(theme.appearance) ||
    !theme.colors ||
    [
      "background",
      "backgroundSecondary",
      "text",
      "selection",
      "loader",
      "red",
      "orange",
      "yellow",
      "green",
      "blue",
      "purple",
      "magenta",
    ].some(
      (key) => typeof theme.colors[key as keyof Theme["colors"]] !== "string",
    ) ||
    Object.values(theme.colors).some(
      (value) =>
        typeof value !== "string" ||
        !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value),
    )
  )
    throw RpcError.invalidParams(
      "Theme colors must be six or eight digit hex colors",
    );
}
export const themesService: Service = {
  name: "core.themes",
  register(ctx) {
    ctx.onReady(() => {
      for (const theme of BUILTIN_THEMES)
        if (!ctx.entities.get("themes", theme.id, { includeDeleted: true }))
          save(ctx, "themes", theme);
    });
    observeCollection(ctx, "themes", () =>
      ctx.events.emit("themes.changed", {}),
    );
    ctx.rpc.handleAll({
      "themes.list": () => list<Theme>(ctx, "themes"),
      "themes.upsert": (params) => {
        const old = params.id
          ? ctx.entities.get<Theme>("themes", params.id)?.data
          : undefined;
        const theme: Theme = {
          ...stamp(),
          ...old,
          ...params,
          id: params.id || stamp().id,
          builtin: old?.builtin ?? false,
        };
        validateTheme(theme);
        return save(ctx, "themes", theme);
      },
      "themes.delete": ({ id }) => {
        if (ctx.entities.get<Theme>("themes", id)?.data.builtin)
          throw RpcError.invalidParams("Built-in themes cannot be deleted");
        ctx.entities.delete("themes", id);
      },
    });
  },
};
