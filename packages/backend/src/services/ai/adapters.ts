import { randomUUID } from "node:crypto";
import type { AIToolCall } from "@opencast/protocol";
import type { AICompletionResult } from "../../context";
import { checkedFetch, objectArguments, ProviderError, redact } from "./common";
import { parseSSE } from "./sse";
import { mapRequest, toolName, type AdapterRequest } from "./request-mapping";
import { streamResponses } from "./responses";
export { mapRequest } from "./request-mapping";
export type { AdapterRequest } from "./request-mapping";
interface PendingCall {
  id: string;
  name: string;
  args: string;
  value?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
export async function streamAdapter(
  input: AdapterRequest,
): Promise<AICompletionResult> {
  const { provider, model, request, onEvent } = input;
  const mapped = mapRequest(input);
  const headers = new Headers(input.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "text/event-stream");
  const response = await checkedFetch(
    mapped.url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(mapped.body),
      signal: request.signal,
    },
    input.secrets,
  );
  if (!response.body)
    throw new ProviderError("Provider returned no response body");
  if (provider.api === "openai-responses")
    return streamResponses(response.body, input);
  const calls = new Map<number, PendingCall>();
  const names = new Map(
    (request.tools ?? []).map((t) => [toolName(t.name), t.name]),
  );
  let text = "",
    reasoning = "",
    finishReason: string | undefined,
    ended = false;
  let usage: NonNullable<AICompletionResult["usage"]> = {};
  const anthropicContent: any[] = [];
  const delta = (kind: "text" | "reasoning", value: unknown) => {
    if (typeof value === "string" && value) {
      if (kind === "text") text += value;
      else reasoning += value;
      onEvent?.({ type: kind, delta: value });
    }
  };
  for await (const frame of parseSSE(response.body, request.signal)) {
    if (frame.data.trim() === "[DONE]") {
      ended = true;
      break;
    }
    let json: any;
    try {
      json = JSON.parse(frame.data);
    } catch {
      throw new ProviderError("Provider sent malformed JSON in its SSE stream");
    }
    if (frame.event === "error" || json.error)
      throw new ProviderError(
        redact(
          `Provider stream error: ${json.error?.message ?? json.message ?? "Unknown provider error"}`,
          input.secrets,
        ),
        json.error?.code === "overloaded_error" ? 529 : undefined,
      );
    if (provider.api === "anthropic") {
      if (json.type === "message_start")
        usage = {
          inputTokens: json.message?.usage?.input_tokens,
          outputTokens: json.message?.usage?.output_tokens,
        };
      if (json.type === "content_block_start") {
        const block = { ...json.content_block };
        anthropicContent[json.index] = block;
        if (block.type === "tool_use")
          calls.set(json.index, {
            id: block.id,
            name: block.name,
            args: "",
            value: block.input,
          });
        if (block.type === "text") delta("text", block.text);
        if (block.type === "thinking") delta("reasoning", block.thinking);
      }
      if (json.type === "content_block_delta") {
        const d = json.delta,
          block = anthropicContent[json.index];
        if (d.type === "text_delta") {
          delta("text", d.text);
          if (block) block.text += d.text;
        }
        if (d.type === "thinking_delta") {
          delta("reasoning", d.thinking);
          if (block) block.thinking += d.thinking;
        }
        if (d.type === "signature_delta" && block)
          block.signature = (block.signature ?? "") + d.signature;
        if (d.type === "input_json_delta") {
          const call = calls.get(json.index);
          if (call) call.args += d.partial_json;
        }
      }
      if (json.type === "message_delta") {
        finishReason = json.delta?.stop_reason ?? finishReason;
        usage = {
          ...usage,
          outputTokens: json.usage?.output_tokens ?? usage.outputTokens,
        };
      }
      if (json.type === "message_stop") {
        ended = true;
        break;
      }
    } else if (provider.api === "google") {
      const candidate = json.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        if (part.text) delta(part.thought ? "reasoning" : "text", part.text);
        if (part.functionCall)
          calls.set(calls.size, {
            id: part.functionCall.id ?? randomUUID(),
            name: part.functionCall.name,
            args: "",
            value: part.functionCall.args ?? {},
            metadata: { googlePart: part },
          });
      }
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (json.promptFeedback?.blockReason)
        throw new ProviderError(
          `Gemini blocked the prompt: ${json.promptFeedback.blockReason}`,
        );
      if (json.usageMetadata)
        usage = {
          inputTokens: json.usageMetadata.promptTokenCount,
          outputTokens: json.usageMetadata.candidatesTokenCount,
          reasoningTokens: json.usageMetadata.thoughtsTokenCount,
        };
    } else {
      const choice = json.choices?.[0],
        d = choice?.delta ?? choice?.message;
      if (d) {
        delta("text", d.content);
        delta("reasoning", d.reasoning_content ?? d.reasoning);
        for (const tc of d.tool_calls ?? []) {
          const index = tc.index ?? 0;
          const existing = calls.get(index) ?? {
            id: tc.id ?? randomUUID(),
            name: "",
            args: "",
          };
          if (tc.id) existing.id = tc.id;
          existing.name += tc.function?.name ?? "";
          existing.args += tc.function?.arguments ?? "";
          calls.set(index, existing);
        }
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (json.usage)
        usage = {
          inputTokens: json.usage.prompt_tokens,
          outputTokens: json.usage.completion_tokens,
          reasoningTokens:
            json.usage.completion_tokens_details?.reasoning_tokens,
        };
    }
  }
  if (!ended && !finishReason)
    throw new ProviderError(
      "Provider stream ended before a completion marker. Retry the request.",
    );
  const toolCalls: AIToolCall[] = [];
  for (const [index, pending] of calls) {
    let args: Record<string, unknown>;
    try {
      args = objectArguments(
        pending.args ? JSON.parse(pending.args) : (pending.value ?? {}),
      );
    } catch {
      throw new ProviderError(
        `Provider returned incomplete or invalid arguments for tool ${names.get(pending.name) ?? "unknown"}`,
      );
    }
    const name = names.get(pending.name);
    if (!name)
      throw new ProviderError(
        "Provider requested a tool that was not offered for this turn",
      );
    if (provider.api === "anthropic") anthropicContent[index].input = args;
    toolCalls.push({
      id: pending.id,
      name,
      arguments: args,
      status: "pending",
      providerMetadata: pending.metadata,
    });
  }
  if (provider.api === "anthropic" && toolCalls.length)
    toolCalls[0].providerMetadata = {
      anthropicContent: anthropicContent.filter(Boolean),
    };
  for (const call of toolCalls)
    call.providerMetadata = {
      ...call.providerMetadata,
      sourceModelRef: `${provider.id}/${model.id}`,
    };
  return {
    text,
    reasoning: reasoning || undefined,
    toolCalls,
    model: `${provider.id}/${model.id}`,
    usage: Object.values(usage).some((v) => v !== undefined)
      ? usage
      : undefined,
    finishReason: finishReason ?? "stop",
  };
}
