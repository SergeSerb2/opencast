import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
const { connections } = vi.hoisted(() => ({ connections: [] as any[] }));
vi.mock("undici", async (original) => {
  const actual = await original<typeof import("undici")>();
  return { ...actual, Agent: class extends actual.Agent {
    constructor(options: any) { super(options); connections.push(options); }
  } };
});
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
beforeEach(() => {
  connections.length = 0;
  vi.mocked(lookup).mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
});
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

it.each([
  "0.0.0.0", "10.0.0.1", "127.0.0.1", "127.1", "2130706433",
  "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "100.127.255.255",
  "[::]", "[::1]", "[fc00::1]", "[fd12::1]", "[fe80::1]",
  "[::ffff:127.0.0.1]", "[::ffff:192.168.1.1]", "[::ffff:100.64.0.1]",
])("rejects non-public literal %s before fetching", async (host) => {
  const fetch = vi.fn(async () => new Response("private"));
  vi.stubGlobal("fetch", fetch);
  await expect(readPage(`http://${host}/`)).rejects.toThrow("public");
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["127.0.0.1", "10.1.2.3", "169.254.169.254", "100.64.1.1", "::1", "fd00::1", "::ffff:7f00:1"])(
  "rejects DNS answers containing %s even alongside a public address", async (address) => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address, family: address.includes(":") ? 6 : 4 },
    ] as any);
    const fetch = vi.fn(async () => new Response("private"));
    vi.stubGlobal("fetch", fetch);
    await expect(readPage("http://internal.example.test")).rejects.toThrow("public");
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("re-checks DNS after every redirect, including a same-host redirect", async () => {
  vi.mocked(lookup)
    .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as any)
    .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as any);
  const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "/private" } }));
  vi.stubGlobal("fetch", fetch);
  await expect(readPage("https://example.test")).rejects.toThrow("public");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects redirects to private literal addresses", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "http://[::ffff:169.254.169.254]/" } }));
  vi.stubGlobal("fetch", fetch);
  await expect(readPage("https://example.test")).rejects.toThrow("public");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(["93.184.216.34", "[2606:4700:4700::1111]", "[::ffff:93.184.216.34]"])("keeps public literal %s readable", async (host) => {
  vi.stubGlobal("fetch", async () => new Response("public page"));
  expect((await readPage(`https://${host}/`)).content).toBe("public page");
});

it("pins the connection lookup to validated DNS answers", async () => {
  vi.stubGlobal("fetch", async () => new Response("public page"));
  await readPage("https://example.test");
  vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as any);
  const callback = vi.fn();
  connections[0].connect.lookup("example.test", { all: true }, callback);
  expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  connections[0].connect.lookup("example.test", {}, callback);
  expect(callback).toHaveBeenLastCalledWith(null, "93.184.216.34", 4);
  expect(lookup).toHaveBeenCalledTimes(1);
});
it("fails closed on missing or failed DNS resolution", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.mocked(lookup).mockResolvedValue([] as any);
  await expect(readPage("https://example.test")).rejects.toThrow("public");
  vi.mocked(lookup).mockRejectedValue(new Error("DNS unavailable"));
  await expect(readPage("https://example.test")).rejects.toThrow("DNS unavailable");
  expect(fetch).not.toHaveBeenCalled();
});
