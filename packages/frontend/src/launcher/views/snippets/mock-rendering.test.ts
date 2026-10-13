import { describe, expect, it } from "vitest";
import type { BackendEvents } from "@surgecast/protocol";
import { Emitter } from "../../../bridge/emitter";
import { createLibraryHandlers } from "../../../bridge/mock/library";

describe("browser template previews", () => {
  const handlers = () => createLibraryHandlers(new Emitter<BackendEvents>());

  it("renders calculators, referenced snippets and chained modifiers", async () => {
    const mock = handlers();
    await mock["snippets.create"]!({ name: "Greeting", text: " Hello " });
    const rendered = await mock["snippets.render"]!({ text: '{snippet name="Greeting" | trim | uppercase} {calculator expression="2+2"}' });
    expect(rendered.text).toBe("HELLO 4");
  });

  it("keeps pipes and braces inside quoted defaults literal", async () => {
    expect(await handlers()["snippets.render"]!({ text: '{argument name="x" default="a}b | trim"}' })).toMatchObject({ text: "a}b | trim", arguments: [{ name: "x", default: "a}b | trim" }] });
    expect((await handlers()["quicklinks.resolve"]!({ link: 'https://example.com/{argument name="x" default="a/b" | raw}' })).url).toBe("https://example.com/a/b");
  });

  it("rejects missing and recursive snippet references", async () => {
    const mock = handlers();
    expect(() => mock["snippets.render"]!({ text: '{snippet name="Missing"}' })).toThrow(/unique name/);
    await mock["snippets.create"]!({ name: "Recursive", text: '{snippet name="Recursive"}' });
    expect(() => mock["snippets.render"]!({ text: '{snippet name="Recursive"}' })).toThrow(/cannot contain/);
  });
});
