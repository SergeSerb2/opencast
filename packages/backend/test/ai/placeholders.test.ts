import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../src/services/ai/web", async (original) => {
  const actual = await original<typeof import("../../src/services/ai/web")>();
  return {
    ...actual,
    browserTab: vi.fn(async () => ({
      title: "Current Page",
      url: "https://example.test/page",
    })),
    readPage: vi.fn(async (_url: string, format: string) => ({
      title: "Page",
      url: "https://example.test/page",
      content:
        format === "html"
          ? '<main><p class="pick">Selected content</p><p>Other</p></main>'
          : "Readable page content",
    })),
  };
});
import { browserTab, readPage } from "../../src/services/ai/web";
import {
  commandArguments,
  resolvePlaceholders,
} from "../../src/services/ai/placeholders";
import { harness } from "./harness";
let h: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  vi.clearAllMocks();
});
it("captures one browser tab snapshot and expands every supported field", async () => {
  h = await harness();
  const text = await resolvePlaceholders(
    '{browser-tab.title | raw}\n{browser-tab.url}\n{browser-tab.content format="markdown"}\n{browser-tab}',
    h.ctx,
  );
  expect(text).toBe(
    "Current Page\nhttps://example.test/page\nReadable page content\nTitle: Current Page\nURL: https://example.test/page\n\nReadable page content",
  );
  expect(browserTab).toHaveBeenCalledOnce();
  expect(readPage).toHaveBeenCalledTimes(2);
});
it("uses CSS selectors for text and html and rejects invalid browser contracts", async () => {
  h = await harness();
  expect(
    await resolvePlaceholders(
      '{browser-tab.content selector=".pick" format="text"}',
      h.ctx,
    ),
  ).toBe("Selected content");
  expect(
    await resolvePlaceholders(
      '{browser-tab.content selector=".pick" format="html"}',
      h.ctx,
    ),
  ).toBe('<p class="pick">Selected content</p>');
  expect(() =>
    commandArguments('{browser-tab.content selector="p" format="markdown"}'),
  ).toThrow("selectors");
  expect(() => commandArguments("{browser-tab.invalid}")).toThrow("field");
  expect(() => commandArguments('{browser-tab format="pdf"}')).toThrow(
    "format",
  );
});
it("assigns positional arguments consistently and permits compact modifier syntax", async () => {
  h = await harness();
  expect(commandArguments("{argument} {argument}").map((a) => a.name)).toEqual([
    "Argument 1",
    "Argument 2",
  ]);
  expect(
    await resolvePlaceholders(
      "{argument} {argument} {selection|uppercase}",
      h.ctx,
      {
        arguments: { "Argument 1": "One", "Argument 2": "Two" },
        selection: "three",
      },
    ),
  ).toBe("One Two THREE");
  expect(
    await resolvePlaceholders('{argument name="Match" default="a|b"}', h.ctx),
  ).toBe("a|b");
});
it("uses the clipboard service for history offsets", async () => {
  h = await harness();
  h.ctx.rpc.handle("clipboard.list", (params) => {
    expect(params).toEqual({ offset: 2, limit: 1 });
    return { items: [{ text: "Older clipboard" }] as never, total: 3 };
  });
  expect(await resolvePlaceholders('{clipboard offset="2"}', h.ctx)).toBe(
    "Older clipboard",
  );
});
