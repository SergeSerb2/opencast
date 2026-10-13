import { load } from "cheerio";
import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Agent } from "undici";
import { promisify } from "node:util";
import type { AppContext, ToolProvider } from "../../context";
import { abortable, abortSignal, checkedFetch, httpUrl } from "./common";
const run = promisify(execFile);
export function decodeHtml(text: string): string {
  return text.replace(
    /&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi,
    (all, n: string, name: string) => {
      if (n) {
        const value = parseInt(
          n.startsWith("x") ? n.slice(1) : n,
          n.startsWith("x") ? 16 : 10,
        );
        return value <= 0x10ffff ? String.fromCodePoint(value) : all;
      }
      return (
        (
          {
            amp: "&",
            lt: "<",
            gt: ">",
            quot: '"',
            apos: "'",
            nbsp: " ",
          } as Record<string, string>
        )[name.toLowerCase()] ?? all
      );
    },
  );
}
export function readableHtml(
  html: string,
  format: "text" | "markdown" = "text",
): string {
  const $ = load(html);
  $(
    "script, style, noscript, svg, nav, footer, header, head, [hidden], [aria-hidden='true']",
  ).remove();
  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");
  if (format === "markdown") {
    root.find("h1,h2,h3,h4,h5,h6").each((_, element) => {
      const tag = element.tagName;
      $(element).replaceWith(
        `\n${"#".repeat(Number(tag.slice(1)))} ${$(element).text()}\n`,
      );
    });
    root.find("a[href]").each((_, element) => {
      const href = $(element).attr("href") ?? "";
      if (/^https?:\/\//.test(href))
        $(element).replaceWith(`[${$(element).text()}](${href})`);
    });
    root.find("li").prepend("\n- ");
  }
  root.find("br").replaceWith("\n");
  root.find("p,div,li,tr,section,pre,h1,h2,h3,h4,h5,h6").append("\n");
  return root
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}
// BlockList also checks IPv4-mapped IPv6 against the IPv4 ranges.
const nonPublic = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) nonPublic.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) nonPublic.addSubnet(address, prefix, "ipv6");
async function publicPageAgent(url: string, signal: AbortSignal): Promise<Agent> {
  const hostname = httpUrl(url).hostname.replace(/^\[|\]$/g, "");
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await abortable(lookup(hostname, { all: true }), signal);
  if (!addresses.length || addresses.some(({ address, family }) =>
    !isIP(address) || nonPublic.check(address, family === 6 ? "ipv6" : "ipv4")))
    throw new Error("Web reads require a public address");
  // Use only the checked answers, preserving the URL hostname for Host and TLS.
  // A dedicated direct connection prevents a proxy from resolving the name again.
  return new Agent({ connect: { lookup: (_hostname, options, callback) => {
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  } } });
}
export async function readPage(
  url: string,
  format: "text" | "markdown" | "html" = "text",
  signal?: AbortSignal,
): Promise<{ title: string; url: string; content: string }> {
  const requestSignal = abortSignal(signal, 60_000);
  const agents: Agent[] = [];
  try {
    let response: Response | undefined;
    for (let i = 0; i < 6; i++) {
      const dispatcher = await publicPageAgent(url, requestSignal);
      agents.push(dispatcher);
      const init: RequestInit = {
        // Node ships older Undici declarations; the dispatcher is runtime-compatible.
        dispatcher: dispatcher as unknown as RequestInit["dispatcher"],
        redirect: "manual",
        signal: requestSignal,
        headers: { Accept: "text/html,text/plain,application/json" },
      };
      response = await fetch(url, init);
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        const next = new URL(response.headers.get("location")!, url);
        await response.body?.cancel();
        url = next.toString();
        continue;
      }
      break;
    }
    if (!response?.ok) {
      await response?.body?.cancel();
      throw new Error(`Page fetch HTTP ${response?.status ?? "unknown"}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Page response has no content");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (length < 200_000) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = value.slice(0, 200_000 - length);
        chunks.push(chunk);
        length += chunk.length;
      }
    } finally {
      await reader.cancel();
    }
    const html = Buffer.concat(chunks).toString("utf8");
    const isHtml =
      /text\/html/i.test(response.headers.get("content-type") ?? "") ||
      /<html\b/i.test(html);
    const title = isHtml
      ? decodeHtml(
          html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
            new URL(url).hostname,
        )
      : new URL(url).hostname;
    return {
      title: title.trim(),
      url,
      content: isHtml && format !== "html" ? readableHtml(html, format) : html,
    };
  } finally {
    await Promise.all(agents.map(agent => agent.close()));
  }
}
export async function browserTab(
  signal?: AbortSignal,
): Promise<{ title: string; url: string }> {
  if (process.platform !== "darwin")
    throw new Error(
      "Browser-tab context requires macOS and Safari, Chrome, or Arc",
    );
  const script = `tell application "System Events" to set appName to name of first application process whose frontmost is true
if appName is "Safari" then
 tell application "Safari" to return name of current tab of front window & linefeed & URL of current tab of front window
else if appName is "Google Chrome" or appName is "Arc" or appName is "Chromium" or appName is "Brave Browser" or appName is "Microsoft Edge" then
 using terms from application "Google Chrome"
  tell application appName to return title of active tab of front window & linefeed & URL of active tab of front window
 end using terms from
else
 error "Focus a Safari, Chrome, or Arc browser tab before running this command"
end if`;
  const { stdout } = await run("/usr/bin/osascript", ["-e", script], {
    timeout: 15_000,
    signal,
  });
  const [title, ...rest] = stdout.trim().split("\n");
  const url = rest.join("\n");
  httpUrl(url);
  return { title, url };
}
export function webTools(ctx: AppContext): ToolProvider {
  return {
    id: "web",
    async list() {
      return [
        {
          name: "web.search",
          title: "Search the Web",
          description:
            "Search using the user's configured search service. Returns source URLs and excerpts.",
          toolset: "web",
          toolsetTitle: "Web",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { type: "integer", minimum: 1, maximum: 20 },
            },
            required: ["query"],
          },
        },
        {
          name: "web.read",
          title: "Read Webpage",
          description:
            "Read a public webpage URL and return its title and readable text.",
          toolset: "web",
          toolsetTitle: "Web",
          inputSchema: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
          },
        },
      ];
    },
    async call(name, args, { signal }) {
      if (name === "web.read") {
        if (typeof args.url !== "string")
          throw new Error("Web read requires a URL");
        return readPage(args.url, "markdown", signal);
      }
      if (name !== "web.search") throw new Error(`Unknown web tool ${name}`);
      if (typeof args.query !== "string" || !args.query.trim())
        throw new Error("Web search requires a query");
      const provider = ctx.settings.get("ai.webSearchProvider");
      if (provider === "none")
        throw new Error("Choose a web search provider in AI Settings first");
      const key = await ctx.secrets.get(`ai.websearch:${provider}:apiKey`);
      if (!key && !["searxng", "jina"].includes(provider))
        throw new Error(`Configure the ${provider} search API key first`);
      const limit = Math.max(1, Math.min(20, Number(args.limit) || 10));
      const override = ctx.settings.get("ai.webSearchBaseUrl");
      let url: string,
        body: unknown,
        headers: Record<string, string> = {};
      if (provider === "tavily") {
        url = `${override ?? "https://api.tavily.com"}/search`;
        headers.Authorization = `Bearer ${key}`;
        body = { query: args.query, max_results: limit };
      } else if (provider === "exa") {
        url = `${override ?? "https://api.exa.ai"}/search`;
        headers["x-api-key"] = key!;
        body = {
          query: args.query,
          numResults: limit,
          contents: { text: { maxCharacters: 2000 } },
        };
      } else if (provider === "brave") {
        const u = new URL(
          `${override ?? "https://api.search.brave.com"}/res/v1/web/search`,
        );
        u.searchParams.set("q", args.query);
        u.searchParams.set("count", String(limit));
        url = u.toString();
        headers["X-Subscription-Token"] = key!;
      } else if (provider === "searxng") {
        if (!override) throw new Error("Configure the SearXNG base URL first");
        const u = new URL(`${override.replace(/\/$/, "")}/search`);
        u.searchParams.set("q", args.query);
        u.searchParams.set("format", "json");
        url = u.toString();
      } else {
        url = `${override ?? "https://s.jina.ai"}/${encodeURIComponent(args.query)}`;
        headers.Accept = "application/json";
        if (key) headers.Authorization = `Bearer ${key}`;
      }
      if (body) headers["Content-Type"] = "application/json";
      const json = (await (
        await checkedFetch(
          url,
          {
            method: body ? "POST" : "GET",
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: abortSignal(signal, 30_000),
          },
          key ? [key] : [],
        )
      ).json()) as any;
      const results = json.web?.results ?? json.results ?? json.data ?? [];
      if (!Array.isArray(results))
        throw new Error("Search provider returned an invalid result list");
      return {
        results: results.slice(0, limit).map((r) => ({
          url: r.url,
          title: r.title,
          content: String(r.content ?? r.description ?? r.text ?? "").slice(
            0,
            2000,
          ),
        })),
      };
    },
  };
}
