import { afterEach, expect, it } from "vitest";
import { harness } from "./harness";
let h: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => { await h?.close(); h = undefined; });
it("stores and removes web search keys without including them in entities", async () => {
  h = await harness();
  for (const provider of ["tavily", "brave", "exa", "searxng", "jina"] as const) {
    expect(await h.rpc("ai.webSearch.hasApiKey", { provider })).toBe(false);
    await h.rpc("ai.webSearch.setApiKey", { provider, apiKey: "synthetic-search-key" });
    expect(await h.rpc("ai.webSearch.hasApiKey", { provider })).toBe(true);
    expect(h.keys.get(`ai.websearch:${provider}:apiKey`)).toBe("synthetic-search-key");
    expect(JSON.stringify(h.ctx.entities.dirty())).not.toContain("synthetic-search-key");
    await h.rpc("ai.webSearch.setApiKey", { provider, apiKey: null });
    expect(await h.rpc("ai.webSearch.hasApiKey", { provider })).toBe(false);
  }
});
it("restores built-in presets and rejects resetting user presets", async () => {
  h = await harness();
  const original = (await h.rpc("ai.presets.list", {}))[0];
  await h.rpc("ai.presets.upsert", { ...original, name: "Edited", instructions: "Changed", reasoningEffort: "high" });
  expect(await h.rpc("ai.presets.reset", { id: original.id })).toMatchObject({ name: original.name, instructions: original.instructions, createdAt: original.createdAt });
  const custom = await h.rpc("ai.presets.upsert", { name: "Custom" });
  await expect(h.rpc("ai.presets.reset", { id: custom.id })).rejects.toThrow("built-in");
});
