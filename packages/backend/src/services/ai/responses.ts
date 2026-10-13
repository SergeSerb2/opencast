import type { AIToolCall } from "@surgecast/protocol";
import type { AICompletionResult } from "../../context";
import { objectArguments, ProviderError, redact } from "./common";
import { toolName, type AdapterRequest } from "./request-mapping";
import { parseSSE } from "./sse";

interface OutputItem {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string; refusal?: string }[];
  summary?: { type: string; text: string }[];
  [key: string]: unknown;
}

/** Consume typed Responses events. Only a terminal response can authorize tool execution. */
export async function streamResponses(
  body: ReadableStream<Uint8Array>,
  input: AdapterRequest,
): Promise<AICompletionResult> {
  const { provider, model, request, onEvent } = input;
  const output = new Map<number, OutputItem>();
  const streamedText = new Set<number>();
  const streamedReasoning = new Set<number>();
  const names = new Map(
    (request.tools ?? []).map((t) => [toolName(t.name), t.name]),
  );
  let text = "",
    reasoning = "",
    ended = false;
  let finishReason = "stop";
  let usage: AICompletionResult["usage"];
  const delta = (kind: "text" | "reasoning", value: unknown) => {
    if (typeof value !== "string" || !value) return;
    if (kind === "text") text += value;
    else reasoning += value;
    onEvent?.({ type: kind, delta: value });
  };
  const receiveItem = (index: number, item: OutputItem, final: boolean) => {
    output.set(index, { ...output.get(index), ...item });
    if (!final) return;
    if (item.type === "message" && !streamedText.has(index)) {
      for (const part of item.content ?? [])
        delta("text", part.type === "refusal" ? part.refusal : part.text);
      streamedText.add(index);
    }
    if (item.type === "reasoning" && !streamedReasoning.has(index)) {
      for (const part of item.summary ?? []) delta("reasoning", part.text);
      streamedReasoning.add(index);
    }
  };
  for await (const frame of parseSSE(body, request.signal)) {
    if (frame.data.trim() === "[DONE]") break;
    let event: any;
    try {
      event = JSON.parse(frame.data);
      if (!event || typeof event !== "object") throw new Error();
    } catch {
      throw new ProviderError(
        "Provider sent malformed JSON in its Responses stream",
      );
    }
    const type = event.type ?? frame.event;
    if (type === "error" || type === "response.failed" || event.error) {
      const error = event.response?.error ?? event.error ?? event;
      throw new ProviderError(
        redact(
          `Provider stream error: ${error.message ?? "Response failed"}`,
          input.secrets,
        ),
      );
    }
    if (
      type === "response.output_text.delta" ||
      type === "response.refusal.delta"
    ) {
      streamedText.add(event.output_index);
      delta("text", event.delta);
    } else if (type === "response.reasoning_summary_text.delta") {
      streamedReasoning.add(event.output_index);
      delta("reasoning", event.delta);
    } else if (
      type === "response.output_item.added" ||
      type === "response.output_item.done"
    ) {
      if (!Number.isInteger(event.output_index) || !event.item?.type)
        throw new ProviderError(
          "Provider sent an invalid Responses output item",
        );
      receiveItem(event.output_index, event.item, type.endsWith(".done"));
    } else if (
      type === "response.function_call_arguments.delta" ||
      type === "response.function_call_arguments.done"
    ) {
      const item = output.get(event.output_index);
      if (
        !item ||
        item.type !== "function_call" ||
        (item.id && item.id !== event.item_id)
      )
        throw new ProviderError(
          "Provider sent arguments for an unknown function call",
        );
      const value = type.endsWith(".done") ? event.arguments : event.delta;
      if (typeof value !== "string")
        throw new ProviderError("Provider sent invalid function arguments");
      item.arguments = type.endsWith(".done")
        ? value
        : (item.arguments ?? "") + value;
    } else if (
      type === "response.completed" ||
      type === "response.incomplete"
    ) {
      const response = event.response;
      if (!response || response.error) {
        throw new ProviderError(
          redact(
            `Provider stream error: ${response?.error?.message ?? "Invalid terminal response"}`,
            input.secrets,
          ),
        );
      }
      if (Array.isArray(response.output))
        response.output.forEach((item: OutputItem, index: number) =>
          receiveItem(index, item, true),
        );
      if (response.usage)
        usage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          reasoningTokens:
            response.usage.output_tokens_details?.reasoning_tokens,
        };
      if (type === "response.incomplete") {
        if ([...output.values()].some((item) => item.type === "function_call"))
          throw new ProviderError(
            "Provider response was incomplete; its tool calls were not executed",
          );
        finishReason =
          response.incomplete_details?.reason === "max_output_tokens"
            ? "length"
            : (response.incomplete_details?.reason ?? "incomplete");
      }
      ended = true;
      break;
    }
  }
  request.signal?.throwIfAborted();
  if (!ended)
    throw new ProviderError(
      "Provider stream ended before a completion marker. Retry the request.",
    );
  const items = [...output.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, item]) => item);
  const calls: AIToolCall[] = [];
  for (const item of items) {
    if (item.type !== "function_call") continue;
    const name = names.get(item.name ?? "");
    if (!name)
      throw new ProviderError(
        "Provider requested a tool that was not offered for this turn",
      );
    if (!item.call_id || calls.some((call) => call.id === item.call_id))
      throw new ProviderError(
        "Provider returned a missing or duplicate function call ID",
      );
    let args: Record<string, unknown>;
    try {
      args = objectArguments(JSON.parse(item.arguments ?? ""));
    } catch {
      throw new ProviderError(
        `Provider returned incomplete or invalid arguments for tool ${name}`,
      );
    }
    calls.push({
      id: item.call_id,
      name,
      arguments: args,
      status: "pending",
      providerMetadata: { sourceModelRef: `${provider.id}/${model.id}` },
    });
  }
  // Carry encrypted reasoning and exact wire items through durable tool-turn snapshots.
  if (calls.length) calls[0].providerMetadata!.responsesOutput = items;
  return {
    text,
    reasoning: reasoning || undefined,
    toolCalls: calls,
    model: `${provider.id}/${model.id}`,
    usage,
    finishReason: calls.length ? "tool_calls" : finishReason,
  };
}
