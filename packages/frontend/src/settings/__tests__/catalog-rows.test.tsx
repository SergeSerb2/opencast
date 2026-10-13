import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ALL_STATIC_PAGES } from "../catalog";
import { PageForRoute } from "../pages";
import { settingId } from "../search";

/** Rows that only render in some states (connected sync, a fixed theme, a web search provider). */
const CONDITIONAL = new Set(["cloud-sync:Sync Now", "cloud-sync:Sync Every", "cloud-sync:Synced Devices", "cloud-sync:Danger Zone", "cloud-sync:Disconnect This Mac", "cloud-sync:Delete Cloud Sync Data & Devices", "general:Theme", "ai:Web Search API Key"]);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe("settings catalog", () => {
  for (const page of ALL_STATIC_PAGES.filter((p) => p.rows?.length)) {
    it(`renders a search anchor for every row on ${page.id}`, async () => {
      const { container } = render(<PageForRoute route={page.id} />);
      const expected = (page.rows ?? []).filter((row) => !CONDITIONAL.has(`${page.id}:${row}`));
      await waitFor(
        () => {
          const missing = expected.filter((row) => !container.querySelector(`[data-setting-id="${settingId(row)}"]`));
          expect(missing).toEqual([]);
        },
        { timeout: 2000 },
      );
    });
  }
});
