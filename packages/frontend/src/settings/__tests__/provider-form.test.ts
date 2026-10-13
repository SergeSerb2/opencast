import { describe, expect, it } from "vitest";
import type { AIProvider } from "@surgecast/protocol";
import { draftFromProvider, draftFromTemplate, draftToUpsert, hasErrors, KEYCHAIN_MARKER, supportedApis, validateBaseUrl, validateProviderDraft, type ProviderTemplate } from "../pages/ai/provider-form";

const openai: ProviderTemplate = { id: "openai", name: "OpenAI", api: "openai-responses", supportedApis: ["openai", "openai-responses"], baseUrl: "https://api.openai.com/v1", needsApiKey: true };
const cliproxy: ProviderTemplate = { id: "cliproxyapi", name: "CLIProxyAPI", api: "openai", supportedApis: ["openai", "openai-responses"], baseUrl: "http://127.0.0.1:8317/v1", needsApiKey: false };
const anthropic: ProviderTemplate = { id: "anthropic", name: "Anthropic", api: "anthropic", baseUrl: "https://api.anthropic.com", needsApiKey: true };

const saved: AIProvider = {
  id: "p1",
  name: "Work OpenAI",
  template: "openai",
  api: "openai-responses",
  baseUrl: "https://api.openai.com/v1",
  headers: { "X-Plain": "visible" },
  secretHeaders: ["OpenAI-Organization"],
  enabled: true,
  autoFetchModels: true,
  models: [],
  createdAt: 1,
  updatedAt: 2,
};

describe("base URL validation", () => {
  it("accepts http(s) endpoints, local ones included", () => {
    expect(validateBaseUrl("https://api.openai.com/v1")).toBeNull();
    expect(validateBaseUrl("http://127.0.0.1:8317/v1")).toBeNull();
    expect(validateBaseUrl(" http://localhost:11434 ")).toBeNull();
  });

  it("rejects malformed URLs, other schemes, credentials and hosted AI", () => {
    expect(validateBaseUrl("")).toMatch(/Enter/);
    expect(validateBaseUrl("api.openai.com/v1")).toMatch(/valid/);
    expect(validateBaseUrl("ftp://example.com")).toMatch(/http/);
    expect(validateBaseUrl("https://user:pw@example.com/v1")).toMatch(/user name/);
    expect(validateBaseUrl("https://example.com/v1?api_key=abc")).toMatch(/credentials/);
    expect(validateBaseUrl("https://backend.raycast.com/api/v1")).toMatch(/your own/);
    expect(validateBaseUrl(cliproxy.baseUrl.replace("127.0.0.1:8317", "YOUR-RESOURCE.openai.azure.com"))).toMatch(/Azure/);
  });
});

describe("provider draft validation", () => {
  it("requires a name and the template's API key", () => {
    const draft = { ...draftFromTemplate(openai), name: " " };
    const errors = validateProviderDraft(draft, openai, false);
    expect(errors.name).toBeDefined();
    expect(errors.apiKey).toBe("OpenAI needs an API key");
    expect(hasErrors(errors)).toBe(true);
    expect(hasErrors(validateProviderDraft({ ...draftFromTemplate(openai), apiKey: "sk-test" }, openai, false))).toBe(false);
  });

  it("lets keyless templates and saved keys through and lets an existing key be removed", () => {
    expect(validateProviderDraft(draftFromTemplate(cliproxy), cliproxy, false)).toEqual({});
    const edit = draftFromProvider(saved);
    expect(validateProviderDraft(edit, openai, true)).toEqual({});
    expect(validateProviderDraft({ ...edit, removeApiKey: true }, openai, true).apiKey).toBeUndefined();
    expect(validateProviderDraft({ ...edit, apiKey: "sk-abc def" }, openai, true).apiKey).toMatch(/spaces/);
  });

  it("checks header names, duplicates and values", () => {
    const draft = {
      ...draftFromTemplate(anthropic),
      apiKey: "key",
      headers: [
        { name: "X-Team", value: "a", stored: false },
        { name: "x-team", value: "b", stored: false },
        { name: "Bad Header", value: "c", stored: false },
        { name: "X-Empty", value: "", stored: false },
        { name: "X-Stored", value: "", stored: true },
        { name: "X-Newline", value: "a\nb", stored: false },
      ],
    };
    expect(validateProviderDraft(draft, anthropic, false).headers).toEqual({ 1: "“x-team” is listed twice", 2: expect.stringMatching(/spaces/), 3: "Enter a value", 5: expect.stringMatching(/line breaks/) });
  });
});

describe("provider drafts and upsert params", () => {
  it("prefills from a template and lists the template's API formats", () => {
    expect(draftFromTemplate(cliproxy)).toMatchObject({ name: "CLIProxyAPI", template: "cliproxyapi", api: "openai", baseUrl: "http://127.0.0.1:8317/v1", enabled: true, autoFetchModels: true });
    expect(supportedApis(cliproxy, "openai")).toEqual(["openai", "openai-responses"]);
    expect(supportedApis(anthropic, "anthropic")).toEqual(["anthropic"]);
    expect(supportedApis(undefined, "ollama")).toEqual(["ollama"]);
    expect(supportedApis(anthropic, "openai")).toEqual(["openai", "anthropic"]);
  });

  it("hides Keychain header values when editing", () => {
    expect(draftFromProvider(saved).headers).toEqual([
      { name: "OpenAI-Organization", value: "", stored: true },
      { name: "X-Plain", value: "visible", stored: false },
    ]);
  });

  it("sends the key only when it changes and keeps stored headers by marker", () => {
    const draft = draftFromProvider(saved);
    const unchanged = draftToUpsert(draft);
    expect("apiKey" in unchanged).toBe(false);
    expect(unchanged.provider).toMatchObject({ id: "p1", headers: { "OpenAI-Organization": KEYCHAIN_MARKER, "X-Plain": "visible" }, secretHeaders: ["OpenAI-Organization", "X-Plain"] });
    expect(draftToUpsert({ ...draft, apiKey: "  sk-new  " }).apiKey).toBe("sk-new");
    expect(draftToUpsert({ ...draft, removeApiKey: true }).apiKey).toBeNull();
  });

  it("drops removed headers from secretHeaders so the backend deletes them", () => {
    const draft = { ...draftFromProvider(saved), headers: [{ name: "X-New", value: "secret", stored: false }] };
    expect(draftToUpsert(draft).provider).toMatchObject({ headers: { "X-New": "secret" }, secretHeaders: ["X-New"] });
    expect(draftToUpsert({ ...draft, headers: [] }).provider).toMatchObject({ headers: {}, secretHeaders: [] });
  });

  it("omits the id for new providers and passes models through", () => {
    const params = draftToUpsert(draftFromTemplate(cliproxy), [{ id: "m", name: "m", capabilities: {}, enabled: true }]);
    expect(params.provider.id).toBeUndefined();
    expect(params.provider.models).toHaveLength(1);
  });
});
