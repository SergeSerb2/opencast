import { afterEach, expect, it } from "vitest";
import { harness } from "./harness";

let h: Awaited<ReturnType<typeof harness>>;
afterEach(async () => { await h?.close(); });

it.each(["commands", "presets"] as const)("preserves omitted %s overrides and clears explicit nulls after JSON transport", async (kind) => {
  h = await harness();
  const method = kind === "commands" ? "ai.commands.upsert" : "ai.presets.upsert";
  const list = kind === "commands" ? "ai.commands.list" : "ai.presets.list";
  const base = { name: "Test", prompt: "Hello", model: "local/mock", reasoningEffort: "high" as const };
  const original = await h.rpc(method, base);
  const edit = { id: original.id, name: "Renamed", prompt: "Hello" };
  expect(await h.rpc(method, edit)).toMatchObject({ model: base.model, reasoningEffort: "high" });
  const modelCleared = await h.rpc(method, JSON.parse(JSON.stringify({ ...edit, model: null })));
  expect(modelCleared.model).toBeUndefined();
  expect(modelCleared.reasoningEffort).toBe("high");
  const cleared = await h.rpc(method, JSON.parse(JSON.stringify({ ...edit, reasoningEffort: null })));
  expect(cleared.reasoningEffort).toBeUndefined();
  const stored = (await h.rpc(list, {})).find((item) => item.id === original.id)!;
  expect(stored).not.toHaveProperty("model");
  expect(stored).not.toHaveProperty("reasoningEffort");
  expect(await h.rpc(method, { ...edit, model: base.model, reasoningEffort: "low" })).toMatchObject({ model: base.model, reasoningEffort: "low" });
});
