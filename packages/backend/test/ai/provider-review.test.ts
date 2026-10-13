import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { configuredProvider, harness } from "./harness";
let h: Awaited<ReturnType<typeof harness>>;
afterEach(async () => { await h?.close(); vi.unstubAllGlobals(); });
it("does not persist or throw provider credentials from invalid model JSON", async () => {
  h = await harness();
  const credential = randomUUID().slice(0, 8);
  const provider = await h.rpc("ai.providers.upsert", { provider: configuredProvider, apiKey: credential });
  vi.stubGlobal("fetch", async () => new Response(credential));
  let error: unknown;
  try { await h.rpc("ai.providers.refreshModels", { id: provider.id }); } catch (e) { error = e; }
  expect(String(error).includes(credential)).toBe(false);
  expect(JSON.stringify(h.ctx.entities.dirty()).includes(credential)).toBe(false);
});
it("clears discovery errors after a successful retry", async () => {
  h = await harness();
  const provider = await h.rpc("ai.providers.upsert", { provider: configuredProvider });
  vi.stubGlobal("fetch", async () => new Response("unavailable", { status: 503 }));
  await expect(h.rpc("ai.providers.refreshModels", { id: provider.id })).rejects.toThrow();
  vi.stubGlobal("fetch", async () => Response.json({ data: [{ id: "mock" }] }));
  expect((await h.rpc("ai.providers.refreshModels", { id: provider.id })).modelFetchError).toBeUndefined();
});
