import { createHash } from "node:crypto";
import type { AIModel, AIProvider, AIToolCall } from "@opencast/protocol";
import type { AICompletionRequest } from "../../context";
import type { PreparedTurn, Part } from "./attachments";
import {
  endpoint,
  temperature,
  versionEndpoint,
  type CompletionEvent,
} from "./common";
export interface AdapterRequest {
  provider: AIProvider;
  model: AIModel;
  request: AICompletionRequest;
  turns: PreparedTurn[];
  headers: Record<string, string>;
  secrets: string[];
  onEvent?: (event: CompletionEvent) => void;
}
export function toolName(name: string): string {
  return `sc_${createHash("sha256").update(name).digest("hex").slice(0, 24)}`;
}
function wireCall(call: AIToolCall) {
  return {
    id: call.id,
    type: "function",
    function: {
      name: toolName(call.name),
      arguments: JSON.stringify(call.arguments),
    },
  };
}
function openaiPart(p: Part): object {
  if (p.type === "text") return { type: "text", text: p.text };
  if (p.type === "image")
    return {
      type: "image_url",
      image_url: { url: `data:${p.mimeType};base64,${p.data}` },
    };
  throw new Error("OpenAI-compatible endpoints require extracted PDF text");
}
function anthropicPart(p: Part): object {
  return p.type === "text"
    ? { type: "text", text: p.text }
    : {
        type: p.type === "pdf" ? "document" : "image",
        source: { type: "base64", media_type: p.mimeType, data: p.data },
      };
}
function googlePart(p: Part): object {
  return p.type === "text"
    ? { text: p.text }
    : { inlineData: { mimeType: p.mimeType, data: p.data } };
}
function systemText(input: AdapterRequest): string {
  return [
    input.request.system,
    ...input.turns.filter((t) => t.role === "system").map((t) => t.content),
  ]
    .filter(Boolean)
    .join("\n\n");
}
function wireReasoningEffort(input: AdapterRequest): string | undefined {
  if (!input.model.capabilities.reasoning) return undefined;
  const effort = input.request.reasoningEffort ?? "medium";
  if (effort !== "none") return effort;
  if (/(^|\/)gpt-5(?:-|$)/.test(input.model.id)) return "minimal";
  if (/(^|\/)(o[134](?:-|$)|gpt-6-astra|gpt-6\.1-sol)/.test(input.model.id))
    return "low";
  return effort;
}
export function mapRequest(input: AdapterRequest): {
  url: string;
  body: Record<string, unknown>;
} {
  const { provider, model, request, turns } = input;
  const tools = model.capabilities.tools ? (request.tools ?? []) : [];
  const temp = temperature(request.creativity, provider, model);
  const system = systemText(input);
  const thinking =
    model.capabilities.reasoning && request.reasoningEffort !== "none";
  const maxTokens = Math.min(
    request.maxOutputTokens ?? model.maxOutputTokens ?? 4096,
    model.maxOutputTokens ?? Infinity,
  );
  if (provider.api === "openai-responses") {
    const items: object[] = [];
    for (const turn of turns.filter((t) => t.role !== "system")) {
      if (turn.role === "tool") {
        if (!turn.toolCallId)
          throw new Error("Tool output is missing its call ID");
        items.push({
          type: "function_call_output",
          call_id: turn.toolCallId,
          output: turn.content,
        });
        continue;
      }
      const metadata = turn.toolCalls?.[0]?.providerMetadata;
      if (
        turn.role === "assistant" &&
        metadata?.sourceModelRef === `${provider.id}/${model.id}` &&
        Array.isArray(metadata.responsesOutput)
      ) {
        // Stateless reasoning models need their complete output items on tool continuation.
        items.push(...metadata.responsesOutput);
        continue;
      }
      const content = turn.parts.map((p) => {
        if (p.type === "text") return { type: "input_text", text: p.text };
        if (p.type === "image")
          return {
            type: "input_image",
            image_url: `data:${p.mimeType};base64,${p.data}`,
            detail: "auto",
          };
        return {
          type: "input_file",
          filename: p.name,
          file_data: `data:${p.mimeType};base64,${p.data}`,
        };
      });
      if (content.length) items.push({ role: turn.role, content });
      for (const call of turn.toolCalls ?? [])
        items.push({
          type: "function_call",
          call_id: call.id,
          name: toolName(call.name),
          arguments: JSON.stringify(call.arguments),
        });
    }
    return {
      url: endpoint(provider.baseUrl, "/responses"),
      body: {
        model: model.id,
        instructions: system || undefined,
        input: items,
        stream: true,
        store: false,
        include: model.capabilities.reasoning
          ? ["reasoning.encrypted_content"]
          : undefined,
        reasoning: model.capabilities.reasoning
          ? { effort: wireReasoningEffort(input), summary: "auto" }
          : undefined,
        temperature: temp,
        max_output_tokens: maxTokens,
        tools: tools.length
          ? tools.map((t) => ({
              type: "function",
              name: toolName(t.name),
              description: t.description,
              parameters: t.inputSchema,
              strict: false,
            }))
          : undefined,
      },
    };
  }
  if (provider.api === "anthropic") {
    const budget = { low: 1024, medium: 4096, high: 8192 }[
      request.reasoningEffort === "none"
        ? "medium"
        : (request.reasoningEffort ?? "medium")
    ];
    const outputLimit = thinking
      ? Math.min(
          request.maxOutputTokens ??
            model.maxOutputTokens ??
            Math.max(maxTokens, budget + 1024),
          model.maxOutputTokens ?? Infinity,
        )
      : maxTokens;
    const thinkingBudget = Math.min(budget, outputLimit - 1024);
    if (thinking && thinkingBudget < 1024)
      throw new Error(
        "Extended thinking needs an output token limit of at least 2048. Increase the limit or choose no reasoning.",
      );
    const messages: { role: string; content: any[] }[] = [];
    for (const turn of turns.filter((t) => t.role !== "system")) {
      const role = turn.role === "assistant" ? "assistant" : "user";
      let content =
        turn.role === "tool"
          ? [
              {
                type: "tool_result",
                tool_use_id: turn.toolCallId,
                content: turn.content,
              },
            ]
          : turn.parts.map(anthropicPart);
      if (turn.role === "assistant" && turn.toolCalls?.length)
        content = (turn.toolCalls[0].providerMetadata?.sourceModelRef ===
        `${provider.id}/${model.id}`
          ? (turn.toolCalls[0].providerMetadata?.anthropicContent as any[])
          : undefined) ?? [
          ...content,
          ...turn.toolCalls.map((c) => ({
            type: "tool_use",
            id: c.id,
            name: toolName(c.name),
            input: c.arguments,
          })),
        ];
      if (!content.length) content = [{ type: "text", text: " " }];
      const last = messages.at(-1);
      if (last?.role === role) last.content.push(...content);
      else messages.push({ role, content });
    }
    return {
      url: versionEndpoint(provider.baseUrl, "v1", "/messages"),
      body: {
        model: model.id,
        messages,
        system: system || undefined,
        stream: true,
        max_tokens: outputLimit,
        temperature: thinking ? undefined : temp,
        thinking: thinking
          ? { type: "enabled", budget_tokens: thinkingBudget }
          : undefined,
        tools: tools.length
          ? tools.map((t) => ({
              name: toolName(t.name),
              description: t.description,
              input_schema: t.inputSchema,
            }))
          : undefined,
      },
    };
  }
  if (provider.api === "google") {
    const contents: { role: string; parts: any[] }[] = [];
    for (const turn of turns.filter((t) => t.role !== "system")) {
      const role = turn.role === "assistant" ? "model" : "user";
      const parts =
        turn.role === "tool"
          ? [
              {
                functionResponse: {
                  name: toolName(turn.name ?? "tool"),
                  id: (
                    turns
                      .flatMap((t) => t.toolCalls ?? [])
                      .find((c) => c.id === turn.toolCallId)?.providerMetadata
                      ?.googlePart as any
                  )?.functionCall?.id,
                  response: { result: parseResult(turn.content) },
                },
              },
            ]
          : turn.parts.map(googlePart);
      if (turn.toolCalls?.length)
        parts.push(
          ...turn.toolCalls.map(
            (c) =>
              (c.providerMetadata?.sourceModelRef ===
              `${provider.id}/${model.id}`
                ? c.providerMetadata?.googlePart
                : undefined) ?? {
                functionCall: {
                  name: toolName(c.name),
                  args: c.arguments,
                  id: (c.providerMetadata?.googlePart as any)?.functionCall?.id,
                },
              },
          ),
        );
      if (!parts.length) parts.push({ text: " " });
      const last = contents.at(-1);
      if (last?.role === role) last.parts.push(...parts);
      else contents.push({ role, parts });
    }
    const url = new URL(
      versionEndpoint(
        provider.baseUrl,
        "v1beta",
        `/models/${encodeURIComponent(model.id.replace(/^models\//, ""))}:streamGenerateContent`,
      ),
    );
    url.searchParams.set("alt", "sse");
    return {
      url: url.toString(),
      body: {
        contents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: {
          temperature: temp,
          maxOutputTokens: maxTokens,
          thinkingConfig: model.capabilities.reasoning
            ? /gemini-[3-9]/.test(model.id)
              ? {
                  thinkingLevel:
                    request.reasoningEffort === "none" ||
                    request.reasoningEffort === "low"
                      ? "low"
                      : "high",
                  includeThoughts: true,
                }
              : {
                  thinkingBudget:
                    request.reasoningEffort === "none"
                      ? 0
                      : { low: 1024, medium: 4096, high: 8192 }[
                          request.reasoningEffort ?? "medium"
                        ],
                  includeThoughts: true,
                }
            : undefined,
        },
        tools: tools.length
          ? [
              {
                functionDeclarations: tools.map((t) => ({
                  name: toolName(t.name),
                  description: t.description,
                  parametersJsonSchema: t.inputSchema,
                })),
              },
            ]
          : undefined,
      },
    };
  }
  const messages: Record<string, unknown>[] = [];
  if (system)
    messages.push({
      role: model.capabilities.system === false ? "user" : "system",
      content: system,
    });
  for (const turn of turns.filter((t) => t.role !== "system")) {
    const content =
      turn.parts.length === 1 && turn.parts[0].type === "text"
        ? turn.parts[0].text
        : turn.parts.length
          ? turn.parts.map(openaiPart)
          : turn.content;
    messages.push({
      role: turn.role,
      content,
      ...(turn.role === "assistant" && turn.reasoning !== undefined &&
        turn.reasoningModel === `${provider.id}/${model.id}` ? { reasoning_content: turn.reasoning } : {}),
      tool_call_id: turn.toolCallId,
      tool_calls: turn.toolCalls?.map(wireCall),
    });
  }
  return {
    url: endpoint(provider.baseUrl, "/chat/completions"),
    body: {
      model: model.id,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: temp,
      reasoning_effort: wireReasoningEffort(input),
      [model.capabilities.reasoning && /(^|\/)(o[134]|gpt-[5-9])/.test(model.id)
        ? "max_completion_tokens"
        : "max_tokens"]: request.maxOutputTokens ?? model.maxOutputTokens,
      tools: tools.length
        ? tools.map((t) => ({
            type: "function",
            function: {
              name: toolName(t.name),
              description: t.description,
              parameters: t.inputSchema,
            },
          }))
        : undefined,
    },
  };
}
function parseResult(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}
