import type { AIToolInfo } from "@opencast/protocol";
import type { ToolProvider, ToolRegistry } from "../context";
import { RpcError } from "../util/errors";
import { createLogger } from "../util/log";

const log = createLogger("tools");

/** Aggregates AI tools from providers ("web", "ext", "mcp", ...). Tool names are unique across providers. */
export class DefaultToolRegistry implements ToolRegistry {
  private readonly providers = new Map<string, ToolProvider>();
  private readonly owner = new Map<string, string>();

  registerProvider(provider: ToolProvider): void {
    if (this.providers.has(provider.id)) throw new Error(`Tool provider registered twice: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }

  async list(): Promise<AIToolInfo[]> {
    const out: AIToolInfo[] = [];
    for (const provider of this.providers.values()) {
      try {
        for (const tool of await provider.list()) {
          this.owner.set(tool.name, provider.id);
          out.push(tool);
        }
      } catch (error) {
        log.warn(`tool provider ${provider.id} failed to list`, error);
      }
    }
    return out;
  }

  async call(name: string, args: Record<string, unknown>, options: { signal?: AbortSignal } = {}): Promise<unknown> {
    if (!this.owner.has(name)) await this.list();
    const provider = this.providers.get(this.owner.get(name) ?? "");
    if (!provider) throw RpcError.notFound(`Tool ${name}`);
    return provider.call(name, args, options);
  }
}
