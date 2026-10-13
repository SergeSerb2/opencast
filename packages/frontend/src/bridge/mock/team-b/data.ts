import { RpcErrorCode } from "@opencast/protocol";
import { RpcError } from "../../errors";
import type { MockArea, MockContext } from "./types";

function invalid(message: string): never {
  throw new RpcError({ code: RpcErrorCode.InvalidParams, message });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What the sample Raycast export contains, per `data.importRayconfig` category. */
const RAYCONFIG_CONTENT: Record<string, { imported: number } | { error: string }> = {
  settings: { imported: 18 },
  snippets: { imported: 24 },
  quicklinks: { imported: 9 },
  notes: { imported: 6 },
  ai: { imported: 12 },
  themes: { error: "Theme “Midnight Pro” has an invalid accent color" },
};

/** Collections of the sample OpenCast export (`data.import`). */
const OPENCAST_CONTENT: Record<string, number> = {
  settings: 42,
  commandPrefs: 17,
  snippets: 24,
  quicklinks: 9,
  notes: 6,
  aiCommands: 8,
  aiPresets: 3,
  aiChats: 14,
  aiMessages: 186,
  aiProviders: 2,
  themes: 2,
  windowLayouts: 4,
};

/**
 * Mock backend for import/export and Check Storage. Exports pretend to be
 * encrypted Raycast files: a password is required, and fewer than 8
 * characters counts as wrong.
 */
export function createDataMock(_ctx: MockContext): MockArea {
  return {
    handlers: {
      "data.importRayconfig": async ({ path, password, categories }) => {
        await delay(700);
        if (!/\.rayconfig$/i.test(path)) invalid("Invalid configuration header length");
        if (!password) invalid("This configuration requires a password");
        if (password.length < 8) invalid("Incorrect password or damaged configuration");
        if (categories && !categories.length) invalid("Select at least one category");
        const results = Object.entries(RAYCONFIG_CONTENT)
          .filter(([category]) => !categories || categories.includes(category))
          .map(([category, outcome]) => ("error" in outcome ? { category, imported: 0, error: outcome.error } : { category, imported: outcome.imported }));
        return { results };
      },
      "data.import": async ({ path }) => {
        await delay(600);
        if (/\.rayconfig$/i.test(path)) invalid("Expected an OpenCast configuration");
        return { results: Object.entries(OPENCAST_CONTENT).map(([category, imported]) => ({ category, imported })) };
      },
      "data.export": async ({ path, categories }) => {
        await delay(500);
        if (categories && !categories.length) invalid("Select valid export categories");
        if (!path.startsWith("/")) invalid(`ENOENT: no such file or directory, open '${path}'`);
        return { path };
      },
      "data.storage": async () => {
        await delay(120);
        return {
          totalBytes: 48_213_504,
          databaseBytes: 12_582_912,
          clipboardBytes: 35_630_592,
          entities: { notes: 6, snippets: 24, quicklinks: 9, aiChats: 14, aiMessages: 186, aiCommands: 8, aiPresets: 3, aiProviders: 2, themes: 2, windowLayouts: 5, commandPrefs: 17, settings: 42 },
          clipboardItems: 312,
        };
      },
    },
  };
}
