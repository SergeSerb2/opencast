import { RpcErrorCode, type Theme } from "@opencast/protocol";
import { RpcError } from "../../errors";
import type { MockArea, MockContext } from "./types";

const DAY = 86_400_000;
const NOW = Date.now();

type Colors = Theme["colors"];

function theme(id: string, name: string, appearance: Theme["appearance"], colors: Colors, extra: Partial<Theme> = {}): Theme {
  return { id, name, appearance, colors, createdAt: NOW - 30 * DAY, updatedAt: NOW - 2 * DAY, ...extra };
}

/** The real backend also lists its built-in palettes (flagged `builtin`); the theme browser folds them into its own. */
const BACKEND_BUILTINS: Theme[] = [
  theme("opencast-dark", "OpenCast Dark", "dark", { background: "#000000", backgroundSecondary: "#000000", text: "#FFFFFF", accent: "#4FA3F8", selection: "#FFFFFF", loader: "#FFFFFF", red: "#FF6363", orange: "#FF9217", yellow: "#FFC531", green: "#59D499", blue: "#56C2FF", purple: "#A485FF", magenta: "#CF2F98" }, { builtin: true }),
  theme("opencast-light", "OpenCast Light", "light", { background: "#FFFFFF", backgroundSecondary: "#FFFFFF", text: "#000000", accent: "#138AF2", selection: "#000000", loader: "#000000", red: "#B12424", orange: "#C75D07", yellow: "#F8A300", green: "#006B4F", blue: "#138AF2", purple: "#6A3DEC", magenta: "#9A1B6E" }, { builtin: true }),
  theme("opencast-sky", "Sky", "dark", { background: "#0E1C3F", backgroundSecondary: "#173036", text: "#D7F0F4", accent: "#4FA3F8", selection: "#6688FF", loader: "#47FFFF", red: "#ED5959", orange: "#ED8659", yellow: "#EDD559", green: "#47FF91", blue: "#1A9FFF", purple: "#7759ED", magenta: "#ED59B2" }, { builtin: true }),
];

const USER_THEMES: Theme[] = [
  theme("theme-aurora-night", "Aurora Night", "dark", { background: "#0B1A1F", backgroundSecondary: "#1A1033", text: "#E6F4F1", accent: "#3FE0B5", selection: "#7CF5D2", loader: "#3FE0B5", red: "#FF6B7A", orange: "#FF9F5A", yellow: "#F5D76E", green: "#4CE0A0", blue: "#5AB8FF", purple: "#A98BFF", magenta: "#F06FC5" }),
  theme("theme-linen", "Linen", "light", { background: "#FBF6EE", backgroundSecondary: "#EFE4D2", text: "#2B2118", accent: "#B4662D", selection: "#8A5A2B", loader: "#B4662D", red: "#C0392B", orange: "#C8691C", yellow: "#B88A00", green: "#2E7D4F", blue: "#2F6DB5", purple: "#7B4FC4", magenta: "#B03A7E" }, { createdAt: NOW - 12 * DAY, updatedAt: NOW - 12 * DAY }),
];

const HEX = /^#[\da-f]{6}(?:[\da-f]{2})?$/i;
const REQUIRED: (keyof Colors)[] = ["background", "backgroundSecondary", "text", "selection", "loader", "red", "orange", "yellow", "green", "blue", "purple", "magenta"];

function invalid(message: string): never {
  throw new RpcError({ code: RpcErrorCode.InvalidParams, message });
}

/** Mock backend for themes (`themes.list/upsert/delete`), validating like the real service. */
export function createThemeMock(ctx: MockContext): MockArea {
  const themes: Theme[] = [...BACKEND_BUILTINS, ...USER_THEMES].map((t) => structuredClone(t));
  let counter = 0;
  const changed = () => ctx.events.emit("themes.changed", {});

  return {
    handlers: {
      "themes.list": () => themes,
      "themes.upsert": (params) => {
        const existing = params.id ? themes.find((t) => t.id === params.id) : undefined;
        const next: Theme = { createdAt: Date.now(), ...existing, ...params, id: params.id || `theme-${Date.now().toString(36)}-${++counter}`, builtin: existing?.builtin ?? false, updatedAt: Date.now() };
        if (!next.name?.trim()) invalid("Theme name is required");
        if (REQUIRED.some((key) => typeof next.colors[key] !== "string") || Object.values(next.colors).some((v) => typeof v !== "string" || !HEX.test(v))) invalid("Theme colors must be six or eight digit hex colors");
        if (existing) themes.splice(themes.indexOf(existing), 1, next);
        else themes.push(next);
        changed();
        return next;
      },
      "themes.delete": ({ id }) => {
        const index = themes.findIndex((t) => t.id === id);
        if (index === -1) throw new RpcError({ code: RpcErrorCode.NotFound, message: `Theme ${id} not found` });
        if (themes[index].builtin) invalid("Built-in themes cannot be deleted");
        themes.splice(index, 1);
        changed();
      },
    },
  };
}
