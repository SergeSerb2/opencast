import { afterEach, expect, it, vi } from "vitest";
import { harness } from "./harness";
import { readPage, readableHtml } from "../../src/services/ai/web";
let h: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  vi.unstubAllGlobals();
});
it.each(["tavily", "brave", "exa", "searxng", "jina"] as const)(
  "uses the configured %s search provider and secret account",
  async (provider) => {
    h = await harness();
    h.ctx.settings.set("ai.webSearchProvider", provider);
    if (provider === "searxng")
      h.ctx.settings.set("ai.webSearchBaseUrl", "https://search.example.test");
    await h.ctx.secrets.set(`ai.websearch:${provider}:apiKey`, "search-secret");
    const fetch = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(
          JSON.stringify(
            provider === "brave"
              ? {
                  web: {
                    results: [
                      {
                        title: "Result",
                        url: "https://example.test",
                        description: "Excerpt",
                      },
                    ],
                  },
                }
              : provider === "jina"
                ? {
                    data: [
                      {
                        title: "Result",
                        url: "https://example.test",
                        content: "Excerpt",
                      },
                    ],
                  }
                : {
                    results: [
                      {
                        title: "Result",
                        url: "https://example.test",
                        text: "Excerpt",
                      },
                    ],
                  },
          ),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    await h.ctx.tools.list();
    const result = await h.ctx.tools.call("web.search", {
      query: "test query",
      limit: 4,
    });
    expect(result).toEqual({
      results: [
        { title: "Result", url: "https://example.test", content: "Excerpt" },
      ],
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain(
      provider === "searxng"
        ? "search.example.test/search"
        : provider === "brave"
          ? "brave.com/res/v1/web/search"
          : provider === "jina"
            ? "s.jina.ai"
            : provider === "tavily"
              ? "api.tavily.com"
              : "api.exa.ai",
    );
    expect(init.headers).toMatchObject(
      provider === "brave"
        ? { "X-Subscription-Token": "search-secret" }
        : provider === "exa"
          ? { "x-api-key": "search-secret" }
          : provider === "searxng"
            ? {}
            : { Authorization: "Bearer search-secret" },
    );
  },
);
it("follows bounded public page redirects and removes executable content", async () => {
  let step = 0;
  vi.stubGlobal("fetch", async () =>
    step++ === 0
      ? new Response(null, { status: 302, headers: { Location: "/article" } })
      : new Response(
          "<html><head><title>Example &amp; Page</title></head><main><p>Readable &amp; useful</p><script>secret()</script></main></html>",
          { headers: { "Content-Type": "text/html" } },
        ),
  );
  expect(await readPage("https://example.test/start")).toEqual({
    title: "Example & Page",
    url: "https://example.test/article",
    content: "Readable & useful",
  });
});
it("rejects failed pages and unconfigured searches", async () => {
  h = await harness();
  await h.ctx.tools.list();
  await expect(
    h.ctx.tools.call("web.search", { query: "anything" }),
  ).rejects.toThrow("Choose a web search provider");
  vi.stubGlobal(
    "fetch",
    async () => new Response("No access", { status: 403 }),
  );
  await expect(readPage("https://example.test")).rejects.toThrow("HTTP 403");
});
it("keeps escaped code and excludes hidden DOM content", () => {
  expect(
    readableHtml(
      "<main><pre>if (x &lt; 3) a();</pre><span hidden>private</span><p>Visible</p></main>",
    ),
  ).toBe("if (x < 3) a();\nVisible");
});
