import { EventEmitter } from "node:events";
import { AIModels } from "./constants";
import { randomId, registerCallback, removeCallback, request, notify } from "./bridge";
import { setCapability } from "./environment";
export type Creativity = "none" | "low" | "medium" | "high" | "maximum" | number;
export function temperature(creativity?: Creativity): number | undefined {
  if (creativity === undefined) return undefined;
  const value = typeof creativity === "number" ? creativity : { none: 0, low: 0.5, medium: 1, high: 1.5, maximum: 2 }[creativity];
  if (!Number.isFinite(value)) throw new Error("Invalid AI creativity");
  return Math.min(2, Math.max(0, value));
}
export function ask(prompt: string, options: { creativity?: Creativity; model?: string | { id: string }; signal?: AbortSignal } = {}): Promise<string> & { on(event: "data", listener: (text: string) => void): any } {
  const emitter = new EventEmitter();
  const streamId = randomId();
  let text = "";
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = () => { notify("cancelAI", { streamId }); rejectAbort(new Error("AI request aborted")); };
  const callbackId = registerCallback((chunk: { value: string }) => { text += chunk.value; emitter.emit("data", chunk.value); });
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const completion = options.signal?.aborted ? aborted : Promise.race([
    request("completePrompt", { prompt, temperature: temperature(options.creativity), model: options.model, streamCallbackId: callbackId, streamId }).then((result) => text || result?.text || ""), aborted,
  ]);
  const promise = completion.finally(() => { options.signal?.removeEventListener("abort", abort); removeCallback(callbackId); });
  return Object.assign(promise, { on(event: "data", listener: (text: string) => void) { emitter.on(event, listener); return promise; } });
}
export const AI = {
  ask, Model: AIModels,
  Creativity: { None: "none", Low: "low", Medium: "medium", High: "high", Maximum: "maximum" },
  experimental_decide: (input: any, options: { signal?: AbortSignal } = {}) => {
    if (options.signal?.aborted) return Promise.reject(new Error("AI request aborted"));
    const streamId = randomId();
    let rejectAbort!: (error: Error) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const abort = () => { notify("cancelAI", { streamId }); rejectAbort(new Error("AI request aborted")); };
    options.signal?.addEventListener("abort", abort, { once: true });
    return Promise.race([request("aiDecide", { ...input, streamId }), aborted]).finally(() => options.signal?.removeEventListener("abort", abort));
  },
  refreshModels: () => request("refreshModels"),
  betterAIModels: Object.values(AIModels),
};
setCapability("ai", AI);
