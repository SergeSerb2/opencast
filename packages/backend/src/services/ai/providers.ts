import { randomUUID } from "node:crypto";
import type {
  AIModel,
  AIModelOption,
  AIProvider,
  BackendMethods,
} from "@opencast/protocol";
import type { AppContext } from "../../context";
import {
  abortable,
  checkedFetch,
  endpoint,
  providerUrl,
  ProviderError,
  redact,
  safeError,
  versionEndpoint,
} from "./common";
import { PROVIDER_TEMPLATES } from "./templates";

type Connection = Pick<AIProvider, "api" | "baseUrl"> &
  Partial<Pick<AIProvider, "template" | "headers">>;
type Auth = { headers: Record<string, string>; secrets: string[] };

function connectionHeaders(
  provider: Connection,
  key: string | null,
  extra: Record<string, string>,
): Auth {
  const headers = { ...provider.headers };
  const setHeader = (name: string, value: string) => {
    for (const existing of Object.keys(headers))
      if (existing.toLowerCase() === name.toLowerCase())
        delete headers[existing];
    headers[name] = value;
  };
  if (key) {
    if (provider.api === "anthropic") setHeader("x-api-key", key);
    else if (provider.api === "google") setHeader("x-goog-api-key", key);
    else if (provider.template === "azure") setHeader("api-key", key);
    else setHeader("Authorization", `Bearer ${key}`);
  }
  if (provider.api === "anthropic")
    setHeader("anthropic-version", "2023-06-01");
  for (const [name, value] of Object.entries(extra)) setHeader(name, value);
  return {
    headers,
    secrets: [...(key ? [key] : []), ...Object.values(headers)],
  };
}

function modelsUrl(provider: Connection): string {
  return provider.api === "anthropic"
    ? versionEndpoint(provider.baseUrl, "v1", "/models")
    : provider.api === "google"
      ? versionEndpoint(provider.baseUrl, "v1beta", "/models")
      : provider.api === "ollama"
        ? versionEndpoint(provider.baseUrl, "api", "/tags")
        : endpoint(provider.baseUrl, "/models");
}

/** Translate setup failures here so completion errors keep their provider detail. */
function discoveryError(
  error: unknown,
  provider: Connection,
  secrets: string[],
): Error {
  let message = safeError(error);
  const causes: any[] = [error];
  for (let i = 0; i < causes.length && i < 20; i++) {
    const cause = causes[i];
    if (cause?.cause) causes.push(cause.cause);
    if (Array.isArray(cause?.errors)) causes.push(...cause.errors);
  }
  const url = new URL(provider.baseUrl);
  if (
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    causes.some((e) => e?.code === "ECONNREFUSED")
  ) {
    const name = PROVIDER_TEMPLATES.find(
      (t) => t.id === provider.template,
    )?.name;
    message = `Nothing answered at ${url.host}. Is ${name ?? "your local server"} running?`;
  } else if (error instanceof ProviderError && error.status === 404) {
    message =
      "The server answered but has no model list there. Check that the URL ends with /v1.";
  } else if (
    causes.some(
      (e) =>
        e?.name === "TimeoutError" ||
        e?.code === "ETIMEDOUT" ||
        e?.code === "UND_ERR_CONNECT_TIMEOUT",
    )
  ) {
    message = "No answer within 30 seconds. Check the URL and any proxy.";
  }
  return new Error(redact(message, secrets));
}

export function inferModel(id: string, api: AIProvider["api"]): AIModel {
  const name = id.toLowerCase();
  const reasoning =
    /(^|\/)(o[134](-|$)|gpt-[5-9])|reason|thinking|deepseek-r1|qwen3|gemini-(2\.5|[3-9])|claude-(sonnet|opus)-(4|5)|claude-3[.-]7/.test(
      name,
    );
  const vision =
    /gpt-4o|gpt-4\.1|gpt-[5-9]|claude-3|claude-(sonnet|opus|haiku)|gemini|vision|llava|qwen.*vl|pixtral|grok-[24]/.test(
      name,
    );
  // Exact documented defaults for known families; new models need catalog data or an override.
  const contextWindows: [RegExp, number][] = [
    [/(^|\/)gpt-4\.1(?:-|$)/, 1_047_576],
    [/(^|\/)gpt-4o(?:-|$)/, 128_000],
    [/(^|\/)gpt-5(?:-|$)/, 400_000],
    [/(^|\/)claude-3(?:[.-]|$)/, 200_000],
    [/(^|\/)gemini-(1\.5-flash|2\.[05])(?:-|$)/, 1_048_576],
  ];
  const contextWindow = contextWindows.find(([pattern]) =>
    pattern.test(name),
  )?.[1];
  return {
    id,
    name: id,
    enabled: true,
    contextWindow,
    capabilities: {
      reasoning,
      vision,
      tools:
        !(api === "openai" && /(^|\/)gpt-6(?:[.-]|$)/.test(name)) &&
        /gpt-|(^|\/)o[134]|claude|gemini|llama-?3|qwen|mistral|grok|deepseek/.test(
          name,
        ),
      pdf:
        api === "anthropic" ||
        api === "google" ||
        (api === "openai-responses" && vision),
      system: true,
      temperature: !(
        /(^|\/)(o[134](-|$)|gpt-[5-9])/.test(name) &&
        (api === "openai" || api === "openai-responses")
      ),
    },
  };
}
export class Providers {
  private readonly fetching = new Map<
    string,
    { promise: Promise<AIProvider>; controller: AbortController }
  >();
  private timer?: NodeJS.Timeout;
  constructor(readonly ctx: AppContext) {}
  get(id: string): AIProvider {
    const value = this.ctx.entities.get<AIProvider>("aiProviders", id)?.data;
    if (!value) throw new Error(`AI provider ${id} was not found`);
    return value;
  }
  all(): AIProvider[] {
    return this.ctx.entities
      .list<AIProvider>("aiProviders", { orderBy: "created" })
      .map((r) => r.data)
      .reverse();
  }
  async credentials(
    provider: AIProvider,
  ): Promise<{ headers: Record<string, string>; secrets: string[] }> {
    const key = await this.ctx.secrets.get(`ai.provider:${provider.id}:apiKey`);
    const extra: Record<string, string> = {};
    for (const name of provider.secretHeaders ?? []) {
      const value = await this.ctx.secrets.get(
        `ai.provider:${provider.id}:header:${name}`,
      );
      if (!value)
        throw new Error(
          `Configure the ${name} header for ${provider.name} on this device`,
        );
      extra[name] = value;
    }
    return connectionHeaders(provider, key, extra);
  }
  async list(): Promise<BackendMethods["ai.providers.list"]["result"]> {
    return Promise.all(
      this.all().map(async (p) => ({
        ...p,
        hasApiKey: await this.ctx.secrets.has(`ai.provider:${p.id}:apiKey`),
        missingSecretHeaders: (
          await Promise.all(
            (p.secretHeaders ?? []).map(async (name) =>
              (await this.ctx.secrets.has(`ai.provider:${p.id}:header:${name}`))
                ? []
                : [name],
            ),
          )
        ).flat(),
      })),
    );
  }
  async testDraft({
    provider,
    apiKey,
    secretHeaders,
  }: BackendMethods["ai.providers.testDraft"]["params"]): Promise<
    BackendMethods["ai.providers.testDraft"]["result"]
  > {
    const start = Date.now();
    let auth: Auth = {
      headers: {},
      secrets: [
        apiKey ?? "",
        ...Object.values(secretHeaders ?? {}),
        ...Object.values(provider.headers ?? {}),
      ],
    };
    try {
      providerUrl(provider.baseUrl);
      if (
        ![
          "openai",
          "openai-responses",
          "anthropic",
          "google",
          "ollama",
        ].includes(provider.api)
      )
        throw new Error("Choose a supported API adapter");
      const saved = provider.id ? this.get(provider.id) : undefined;
      const key =
        apiKey === undefined && saved
          ? await this.ctx.secrets.get(`ai.provider:${saved.id}:apiKey`)
          : (apiKey ?? null);
      const extra = {
        ...(secretHeaders ??
          Object.fromEntries(
            (saved?.secretHeaders ?? []).map((name) => [name, "$keychain"]),
          )),
      };
      for (const [name, value] of Object.entries(extra)) {
        if (value === "$keychain") {
          const stored =
            saved &&
            (await this.ctx.secrets.get(
              `ai.provider:${saved.id}:header:${name}`,
            ));
          if (!stored)
            throw new Error(`Configure the ${name} header on this Mac`);
          extra[name] = stored;
        }
      }
      auth = connectionHeaders(
        { ...provider, headers: provider.headers ?? saved?.headers },
        key,
        extra,
      );
      const models = await this.fetchModels(provider, auth);
      return {
        ok: true,
        message: `Connected and fetched ${models.length} models`,
        latencyMs: Date.now() - start,
        modelCount: models.length,
        sampleModelIds: models.slice(0, 5).map((m) => m.id),
      };
    } catch (error) {
      return {
        ok: false,
        message: redact(safeError(error), auth.secrets),
        latencyMs: Date.now() - start,
        modelCount: 0,
        sampleModelIds: [],
      };
    }
  }
  async detectLocal(): Promise<
    BackendMethods["ai.providers.detectLocal"]["result"]
  > {
    const templates = PROVIDER_TEMPLATES.filter(
      (t) => !t.needsApiKey && new URL(t.baseUrl).hostname === "127.0.0.1",
    );
    const found = await Promise.all(
      templates.map(async (t) => {
        const start = Date.now();
        const apis = t.id === "ollama" ? [t.api, "ollama" as const] : [t.api];
        const probes = await Promise.all(
          apis.map(async (api) => {
            try {
              const models = await this.fetchModels(
                { ...t, api },
                { headers: {}, secrets: [] },
                undefined,
                1200,
                1,
              );
              return { api, status: "ok" as const, models };
            } catch (error) {
              // Discovery keeps the HTTP status in the cause, without exposing response bodies.
              if (
                error instanceof Error &&
                error.cause instanceof ProviderError &&
                [401, 403].includes(error.cause.status ?? 0)
              )
                return { api, status: "auth-required" as const, models: [] };
              return null;
            }
          }),
        );
        const result =
          probes.find((p) => p?.status === "ok") ??
          probes.find((p) => p?.status === "auth-required");
        return result
          ? [
              {
                templateId: t.id,
                baseUrl: t.baseUrl,
                api: result.api,
                status: result.status,
                modelCount: result.models.length,
                sample: result.models.slice(0, 5).map((m) => m.id),
                latencyMs: Date.now() - start,
              },
            ]
          : [];
      }),
    );
    return found.flat();
  }
  async upsert({
    provider: input,
    apiKey,
  }: BackendMethods["ai.providers.upsert"]["params"]): Promise<AIProvider> {
    if (
      !input.name?.trim() ||
      !["openai", "openai-responses", "anthropic", "google", "ollama"].includes(
        input.api,
      )
    )
      throw new Error("Provider needs a name and a supported API adapter");
    providerUrl(input.baseUrl);
    const id = input.id ?? randomUUID();
    const old = this.ctx.entities.get<AIProvider>("aiProviders", id)?.data;
    const models = input.models ?? old?.models ?? [];
    if (
      !Array.isArray(models) ||
      models.some((m) => typeof m.id !== "string" || !m.id.trim())
    )
      throw new Error("Every model needs an ID");
    if (new Set(models.map((m) => m.id)).size !== models.length)
      throw new Error("Model IDs must be unique within a provider");
    const headers: Record<string, string> = {
      ...(input.headers ?? old?.headers),
    };
    const secretHeaders = new Set(
      input.secretHeaders ?? old?.secretHeaders ?? [],
    );
    if (input.headers) {
      for (const [name, value] of Object.entries(input.headers)) {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(value))
          throw new Error("Invalid custom HTTP header");
        if (value !== "$keychain")
          await this.ctx.secrets.set(`ai.provider:${id}:header:${name}`, value);
        delete headers[name];
        secretHeaders.add(name);
      }
    }
    for (const name of old?.secretHeaders ?? [])
      if (!secretHeaders.has(name))
        await this.ctx.secrets.delete(`ai.provider:${id}:header:${name}`);
    if (apiKey === null || apiKey === "")
      await this.ctx.secrets.delete(`ai.provider:${id}:apiKey`);
    else if (apiKey !== undefined)
      await this.ctx.secrets.set(`ai.provider:${id}:apiKey`, apiKey);
    const now = Date.now();
    const provider: AIProvider = {
      id,
      name: input.name.trim(),
      template: input.template,
      api: input.api,
      baseUrl: input.baseUrl,
      enabled: input.enabled ?? old?.enabled ?? true,
      autoFetchModels: input.autoFetchModels ?? old?.autoFetchModels ?? true,
      modelFetchError: old?.modelFetchError,
      models: models.map((m) => {
        const inferred = inferModel(m.id, input.api);
        const capabilities = { ...m.capabilities };
        // Stored models include inferred flags. Rebase those defaults when switching
        // adapters; preserve capability edits that differ from the previous defaults.
        if (old && old.api !== input.api) {
          const previous = inferModel(m.id, old.api).capabilities;
          for (const key of ["tools", "pdf", "temperature"] as const)
            if (capabilities[key] === previous[key]) delete capabilities[key];
        }
        return {
          ...inferred,
          ...m,
          capabilities: { ...inferred.capabilities, ...capabilities },
        };
      }),
      headers,
      secretHeaders: [...secretHeaders],
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    };
    this.ctx.entities.put("aiProviders", id, provider);
    if (
      provider.enabled &&
      provider.autoFetchModels &&
      (!provider.models.length ||
        old?.baseUrl !== provider.baseUrl ||
        old?.api !== provider.api ||
        apiKey !== undefined ||
        input.headers !== undefined ||
        Boolean(old?.modelFetchError))
    ) {
      try {
        return await this.refresh(id);
      } catch {
        return this.get(id);
      }
    }
    return provider;
  }
  async delete(id: string): Promise<void> {
    const p = this.get(id);
    const pending = this.fetching.get(id);
    pending?.controller.abort();
    await pending?.promise.catch(() => {});
    await this.ctx.secrets.delete(`ai.provider:${id}:apiKey`);
    for (const name of p.secretHeaders ?? [])
      await this.ctx.secrets.delete(`ai.provider:${id}:header:${name}`);
    this.ctx.entities.delete("aiProviders", id);
  }
  async refresh(id: string): Promise<AIProvider> {
    const active = this.fetching.get(id);
    if (active) return active.promise;
    const controller = new AbortController();
    const promise = this.discover(id, controller.signal)
      .catch((error) => {
        const current = this.ctx.entities.get<AIProvider>(
          "aiProviders",
          id,
        )?.data;
        if (current && !controller.signal.aborted)
          this.ctx.entities.put("aiProviders", id, {
            ...current,
            modelFetchError: safeError(error),
            updatedAt: Date.now(),
          });
        throw error;
      })
      .finally(() => this.fetching.delete(id));
    this.fetching.set(id, { promise, controller });
    return promise;
  }
  private async discover(id: string, signal: AbortSignal): Promise<AIProvider> {
    const provider = this.get(id),
      auth = await this.credentials(provider);
    const discovered = await this.fetchModels(provider, auth, signal);
    // Re-read after network I/O so a concurrent user edit is never overwritten.
    const current = this.get(provider.id);
    if (current.baseUrl !== provider.baseUrl || current.api !== provider.api)
      throw new Error(
        "Provider configuration changed while fetching models. Refresh the model list again.",
      );
    const unique = [...new Map(discovered.map((m) => [m.id, m])).values()];
    const merged = unique.map((m) => {
      const old = current.models.find((o) => o.id === m.id);
      return old
        ? {
            ...m,
            ...old,
            capabilities: { ...m.capabilities, ...old.capabilities },
          }
        : m;
    });
    for (const old of current.models)
      if (!merged.some((m) => m.id === old.id))
        merged.push(old.manual ? old : { ...old, enabled: false });
    const result = { ...current, models: merged, updatedAt: Date.now() };
    delete result.modelFetchError;
    this.ctx.entities.put("aiProviders", id, result);
    return result;
  }
  private async fetchModels(
    provider: Connection,
    auth: Auth,
    signal?: AbortSignal,
    timeout = 30_000,
    maxPages = 20,
  ): Promise<AIModel[]> {
    const path = modelsUrl(provider);
    try {
      let url: string | undefined = path;
      const discovered: AIModel[] = [];
      for (let page = 0; url && page < maxPages; page++) {
        const timeoutSignal = AbortSignal.timeout(timeout);
        const requestSignal = signal
          ? AbortSignal.any([signal, timeoutSignal])
          : timeoutSignal;
        const response = await abortable(
          checkedFetch(
            url,
            {
              headers: auth.headers,
              signal: requestSignal,
            },
            auth.secrets,
          ),
          requestSignal,
        );
        let json: any;
        try {
          json = await abortable(response.json(), requestSignal);
        } catch {
          timeoutSignal.throwIfAborted();
          signal?.throwIfAborted();
          throw new Error(
            "That URL returned a web page, not an API. Check the URL.",
          );
        }
        const rows =
          provider.api === "ollama"
            ? json.models
            : provider.api === "google"
              ? json.models
              : json.data;
        if (!Array.isArray(rows))
          throw new Error("Provider model list did not contain a model array");
        for (const row of rows) {
          const id =
            provider.api === "google"
              ? row.name?.replace(/^models\//, "")
              : (row.id ?? row.name ?? row.model);
          if (typeof id !== "string") continue;
          if (
            provider.api === "google" &&
            row.supportedGenerationMethods &&
            !row.supportedGenerationMethods.includes("generateContent")
          )
            continue;
          const model = inferModel(id, provider.api);
          model.name = row.display_name ?? row.displayName ?? row.name ?? id;
          model.contextWindow =
            row.context_length ?? row.inputTokenLimit ?? model.contextWindow;
          model.maxOutputTokens = row.outputTokenLimit;
          discovered.push(model);
        }
        url = undefined;
        if (provider.api === "google" && json.nextPageToken) {
          const next = new URL(path);
          next.searchParams.set("pageToken", json.nextPageToken);
          url = next.toString();
        }
        if (provider.api === "anthropic" && json.has_more && json.last_id) {
          const next = new URL(path);
          next.searchParams.set("after_id", json.last_id);
          url = next.toString();
        }
      }
      return [...new Map(discovered.map((m) => [m.id, m])).values()];
    } catch (error) {
      const mapped = discoveryError(error, provider, auth.secrets);
      mapped.cause = error;
      throw mapped;
    }
  }
  options(includeDisabled = false): AIModelOption[] {
    return this.all()
      .filter((p) => includeDisabled || p.enabled)
      .flatMap((p) =>
        p.models
          .filter((m) => includeDisabled || m.enabled)
          .map((m) => ({
            ref: `${p.id}/${m.id}`,
            providerId: p.id,
            providerName: p.name,
            modelId: m.id,
            name: m.name,
            capabilities: m.capabilities,
            contextWindow: m.contextWindow,
          })),
      );
  }
  register(): void {
    const ctx = this.ctx;
    ctx.rpc.handleAll({
      "ai.providers.templates": () => structuredClone(PROVIDER_TEMPLATES),
      "ai.providers.list": () => this.list(),
      "ai.providers.testDraft": (p) => this.testDraft(p),
      "ai.providers.detectLocal": () => this.detectLocal(),
      "ai.providers.upsert": (p) => this.upsert(p),
      "ai.providers.delete": (p) => this.delete(p.id),
      "ai.providers.refreshModels": (p) => this.refresh(p.id),
      "ai.providers.test": async ({ id }) => {
        const start = Date.now();
        try {
          await this.refresh(id);
          return {
            ok: true,
            message: "Connected and fetched models",
            latencyMs: Date.now() - start,
          };
        } catch (e) {
          return {
            ok: false,
            message: safeError(e),
            latencyMs: Date.now() - start,
          };
        }
      },
      "ai.models.list": (p) => this.options(p.includeDisabled),
    });
    const off = ctx.entities.onChange((c) => {
      if (c.collection === "aiProviders")
        ctx.events.emit("ai.providers.changed", {});
    });
    const poll = () => {
      for (const provider of this.all())
        if (provider.enabled && provider.autoFetchModels)
          void this.refresh(provider.id).catch(() => {});
    };
    ctx.onReady(() => {
      poll();
      this.timer = setInterval(poll, 3 * 3_600_000);
      this.timer.unref();
    });
    ctx.onShutdown(async () => {
      off();
      clearInterval(this.timer);
      for (const active of this.fetching.values()) active.controller.abort();
      await Promise.allSettled(
        [...this.fetching.values()].map((active) => active.promise),
      );
    });
  }
}
