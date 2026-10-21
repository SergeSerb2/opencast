import type { AICompletionRequest, AIEngine } from "../../context";
import type { AIModel, AIProvider, Creativity } from "@opencast/protocol";

export type CompletionEvent =
  NonNullable<Parameters<AIEngine["complete"]>[1]> extends (
    event: infer E,
  ) => void
    ? E
    : never;
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfter?: string | null,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}
export function httpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP(S) URL without embedded credentials");
  if (
    /(^|\.)raycast\.(com|st)$/.test(url.hostname) ||
    /(^|\.)(?:opencast|surgecast)\.(com|app)$/.test(url.hostname)
  )
    throw new Error(
      "Hosted OpenCast/Raycast AI endpoints are not supported. Configure your own provider.",
    );
  return url;
}
export function providerUrl(value: string): URL {
  const url = httpUrl(value);
  for (const name of url.searchParams.keys())
    if (
      /^(key|api[-_]?key|token|access[-_]?token|password|secret|authorization)$/i.test(
        name,
      )
    )
      throw new Error(
        "Keep credentials out of the provider URL. Use the API key field or a custom Keychain-backed header.",
      );
  return url;
}
export function endpoint(base: string, path: string): string {
  const url = httpUrl(base);
  const prefix = url.pathname.replace(/\/$/, "");
  url.pathname = prefix.endsWith(path) ? prefix : `${prefix}${path}`;
  return url.toString();
}
export function versionEndpoint(
  base: string,
  version: string,
  path: string,
): string {
  const url = httpUrl(base);
  url.pathname =
    url.pathname.replace(/\/(v1|v1beta)\/?$/, "").replace(/\/$/, "") +
    `/${version}${path}`;
  return url.toString();
}
export function temperature(
  creativity: Creativity = "medium",
  provider?: AIProvider,
  model?: AIModel,
): number | undefined {
  if (
    model?.capabilities.temperature === false ||
    (model?.capabilities.temperature !== true &&
      (provider?.api === "openai" || provider?.api === "openai-responses") &&
      /(^|\/)(o[134](?:-|$)|gpt-[5-9])/.test(model?.id ?? ""))
  )
    return undefined;
  const value = { none: 0, low: 0.4, medium: 0.7, high: 1, maximum: 1.3 }[
    creativity
  ];
  if (value === undefined) throw new Error("Unknown creativity level");
  return Math.min(value, provider?.api === "anthropic" ? 1 : 2);
}
export function abortSignal(
  signal?: AbortSignal,
  timeout = 180_000,
): AbortSignal {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
}
export function abortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Request stopped"));
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export function redact(message: string, secrets: string[]): string {
  for (const secret of secrets) {
    const variants = new Set([
      secret,
      secret.trim(),
      secret.match(/^(?:Bearer|Basic)\s+(.+)$/i)?.[1]?.trim(),
    ]);
    for (const value of variants)
      if (value) message = message.split(value).join("[redacted]");
  }
  return message;
}
export async function checkedFetch(
  url: string,
  init: RequestInit = {},
  secrets: string[] = [],
): Promise<Response> {
  httpUrl(url);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: abortSignal(init.signal ?? undefined),
    });
  } catch (error) {
    if (init.signal?.aborted) throw init.signal.reason;
    throw new ProviderError(
      redact(
        `Provider connection failed: ${error instanceof Error ? error.message : String(error)}`,
        secrets,
      ),
      undefined,
      undefined,
      error,
    );
  }
  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const json = JSON.parse(body);
      detail = json.error?.message ?? json.message ?? body;
    } catch {
      /* non-JSON provider error */
    }
    const hint =
      response.status === 401
        ? " Check the API key."
        : response.status === 403
          ? " Check provider permissions."
          : response.status === 429
            ? " Provider rate limit or quota reached."
            : "";
    throw new ProviderError(
      `Provider HTTP ${response.status}: ${redact(String(detail), secrets).slice(0, 2000)}${hint}`,
      response.status,
      response.headers.get("retry-after"),
    );
  }
  return response;
}
export function objectArguments(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Tool arguments must be a JSON object");
  return value as Record<string, unknown>;
}
export function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export type Purpose = NonNullable<AICompletionRequest["purpose"]>;
