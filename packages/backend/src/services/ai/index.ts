import type { Service } from "../../context";
import { Providers } from "./providers";
import { CompletionEngine } from "./engine";
import { Chats } from "./chats";
import { Commands } from "./commands";
import { MCP } from "./mcp";
import { builtinTools } from "./tools";
import { webTools } from "./web";

/** Every AI surface shares the configured provider resolver; there is no hosted fallback. */
export const aiService: Service = {
  name: "ai",
  register(ctx) {
    const providers = new Providers(ctx);
    const engine = new CompletionEngine(ctx, providers);
    const mcp = new MCP(ctx);
    ctx.ai = engine;
    providers.register();
    ctx.tools.registerProvider(webTools(ctx));
    ctx.tools.registerProvider(builtinTools(ctx));
    mcp.register();
    const chats = new Chats(ctx, engine, mcp);
    chats.register();
    new Commands(ctx, chats).register();
    const searchAccount = (provider: string) => {
      if (!["tavily", "brave", "exa", "searxng", "jina"].includes(provider))
        throw new Error("Unknown web search provider");
      return `ai.websearch:${provider}:apiKey`;
    };
    ctx.rpc.handle("ai.webSearch.hasApiKey", ({ provider }) => ctx.secrets.has(searchAccount(provider)));
    ctx.rpc.handle("ai.webSearch.setApiKey", async ({ provider, apiKey }) => {
      const account = searchAccount(provider);
      if (apiKey !== null && typeof apiKey !== "string") throw new Error("Invalid API key");
      if (apiKey) await ctx.secrets.set(account, apiKey);
      else await ctx.secrets.delete(account);
    });
    ctx.rpc.handle("ai.tools.list", async () => {
      // Explicit catalog discovery connects enabled servers; chat execution connects only selected ones.
      await Promise.all(
        mcp
          .servers()
          .filter((s) => s.enabled)
          .map((s) => mcp.connect(s.id).catch(() => {})),
      );
      return ctx.tools.list();
    });
  },
};
