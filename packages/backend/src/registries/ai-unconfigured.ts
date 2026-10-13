import { RpcErrorCode } from "@surgecast/protocol";
import type { AIEngine } from "../context";
import { RpcError } from "../util/errors";

/** Placeholder until the ai service installs the real engine on ctx.ai. */
export const unconfiguredAI: AIEngine = {
  async complete() {
    throw new RpcError(RpcErrorCode.Upstream, "AI is not available: no AI service is registered");
  },
  async listModels() {
    return [];
  },
  async defaultModel() {
    return null;
  },
};
