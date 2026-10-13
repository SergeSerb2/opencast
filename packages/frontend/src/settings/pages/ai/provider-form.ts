import type { AIProvider, AIProviderApi, BackendParams, BackendResult } from "@opencast/protocol";

export type ProviderTemplate = BackendResult<"ai.providers.templates">[number];

/** Marker the backend accepts for a header whose value stays in the Keychain. */
export const KEYCHAIN_MARKER = "$keychain";

export interface HeaderDraft {
  name: string;
  value: string;
  /** Already stored in the Keychain: the value is hidden and kept unless replaced. */
  stored: boolean;
}

export interface ProviderDraft {
  id?: string;
  name: string;
  template: string;
  api: AIProviderApi;
  baseUrl: string;
  /** New API key text; empty keeps the saved key (or none). */
  apiKey: string;
  /** Delete the saved key on save. */
  removeApiKey: boolean;
  headers: HeaderDraft[];
  enabled: boolean;
  autoFetchModels: boolean;
}

export interface ProviderDraftErrors {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  /** By header index. */
  headers?: Record<number, string>;
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const CREDENTIAL_PARAM = /^(key|api[-_]?key|token|access[-_]?token|password|secret|authorization)$/i;
const HOSTED_AI = /(^|\.)(raycast\.(com|st)|(?:opencast|surgecast)\.(com|app))$/;

export const API_LABELS: Record<AIProviderApi, string> = {
  openai: "Chat Completions",
  "openai-responses": "Responses",
  anthropic: "Anthropic Messages",
  google: "Gemini",
  ollama: "Ollama (native)",
};

/** Selectable API formats for a template (its `supportedApis`, else just its default). */
export function supportedApis(template: ProviderTemplate | undefined, current: AIProviderApi): AIProviderApi[] {
  const list = template?.supportedApis?.length ? [...template.supportedApis] : [template?.api ?? current];
  return list.includes(current) ? list : [current, ...list];
}

/** A new draft prefilled from a template. */
export function draftFromTemplate(template: ProviderTemplate): ProviderDraft {
  return { name: template.name, template: template.id, api: template.api, baseUrl: template.baseUrl, apiKey: "", removeApiKey: false, headers: [], enabled: true, autoFetchModels: true };
}

/** A draft for editing a saved provider; header values in the Keychain stay hidden. */
export function draftFromProvider(provider: AIProvider): ProviderDraft {
  const plain = Object.entries(provider.headers ?? {}).filter(([, value]) => value !== KEYCHAIN_MARKER);
  const secret = new Set([
    ...(provider.secretHeaders ?? []),
    ...Object.entries(provider.headers ?? {})
      .filter(([, v]) => v === KEYCHAIN_MARKER)
      .map(([n]) => n),
  ]);
  return {
    id: provider.id,
    name: provider.name,
    template: provider.template,
    api: provider.api,
    baseUrl: provider.baseUrl,
    apiKey: "",
    removeApiKey: false,
    headers: [...[...secret].map((name) => ({ name, value: "", stored: true })), ...plain.filter(([name]) => !secret.has(name)).map(([name, value]) => ({ name, value, stored: false }))],
    enabled: provider.enabled,
    autoFetchModels: provider.autoFetchModels,
  };
}

/** Apply external updates to untouched fields while preserving edits in progress. */
export function reconcileProviderDraft(current: ProviderDraft | null, previous: ProviderDraft | null, next: ProviderDraft): ProviderDraft {
  if (!current || !previous || current.id !== next.id || current.template !== next.template) return next;
  const merged = { ...current };
  for (const key of Object.keys(next) as (keyof ProviderDraft)[]) {
    if (JSON.stringify(current[key]) === JSON.stringify(previous[key])) {
      Object.assign(merged, { [key]: next[key] });
    }
  }
  return merged;
}

/** Validation message for a base URL, or null when the backend will accept it. */
export function validateBaseUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return "Enter the provider's base URL";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "Enter a valid http:// or https:// URL";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Use an http:// or https:// URL";
  if (url.username || url.password) return "Remove the user name and password from the URL";
  if ([...url.searchParams.keys()].some((name) => CREDENTIAL_PARAM.test(name))) return "Keep credentials out of the URL — use the API key field or a header";
  if (HOSTED_AI.test(url.hostname)) return "OpenCast only talks to your own providers — enter your provider's URL";
  if (/YOUR-(RESOURCE|DEPLOYMENT)/.test(text)) return "Replace YOUR-RESOURCE and YOUR-DEPLOYMENT with your Azure values";
  return null;
}

/**
 * Check a provider draft before `ai.providers.upsert`. `hasSavedKey` is the
 * provider's current Keychain state (false for new providers).
 */
export function validateProviderDraft(draft: ProviderDraft, template: Pick<ProviderTemplate, "name" | "needsApiKey"> | undefined, hasSavedKey: boolean): ProviderDraftErrors {
  const errors: ProviderDraftErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = "Give the provider a name";
  else if (name.length > 64) errors.name = "Use at most 64 characters";

  const urlError = validateBaseUrl(draft.baseUrl);
  if (urlError) errors.baseUrl = urlError;

  const key = draft.apiKey.trim();
  const willHaveKey = key.length > 0 || (hasSavedKey && !draft.removeApiKey);
  if (key && /\s/.test(key)) errors.apiKey = "API keys can't contain spaces or line breaks";
  else if (template?.needsApiKey && !willHaveKey && !draft.id) errors.apiKey = `${template.name} needs an API key`;

  const headerErrors: Record<number, string> = {};
  const seen = new Set<string>();
  draft.headers.forEach((header, index) => {
    const headerName = header.name.trim();
    if (!headerName) headerErrors[index] = "Enter a header name";
    else if (!HEADER_NAME.test(headerName)) headerErrors[index] = "Header names can't contain spaces or special characters";
    else if (seen.has(headerName.toLowerCase())) headerErrors[index] = `“${headerName}” is listed twice`;
    else if (!header.stored && !header.value) headerErrors[index] = "Enter a value";
    else if (/[\r\n]/.test(header.value)) headerErrors[index] = "Values can't contain line breaks";
    seen.add(headerName.toLowerCase());
  });
  if (Object.keys(headerErrors).length) errors.headers = headerErrors;
  return errors;
}

export function hasErrors(errors: ProviderDraftErrors): boolean {
  return Boolean(errors.name || errors.baseUrl || errors.apiKey || (errors.headers && Object.keys(errors.headers).length));
}

/**
 * Upsert params for a draft. Header values are only sent when typed; stored
 * ones are sent as the Keychain marker; `secretHeaders` lists the headers to
 * keep so removed ones are deleted from the Keychain. The API key is sent
 * only when it changes (`null` removes it).
 */
export function draftToUpsert(draft: ProviderDraft, models?: AIProvider["models"]): BackendParams<"ai.providers.upsert"> {
  const headers = Object.fromEntries(draft.headers.map((h) => [h.name.trim(), h.stored && !h.value ? KEYCHAIN_MARKER : h.value]));
  const provider: BackendParams<"ai.providers.upsert">["provider"] = {
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name.trim(),
    template: draft.template,
    api: draft.api,
    baseUrl: draft.baseUrl.trim(),
    enabled: draft.enabled,
    autoFetchModels: draft.autoFetchModels,
    headers,
    secretHeaders: Object.keys(headers),
    ...(models ? { models } : {}),
  };
  const key = draft.apiKey.trim();
  if (key) return { provider, apiKey: key };
  if (draft.removeApiKey) return { provider, apiKey: null };
  return { provider };
}
