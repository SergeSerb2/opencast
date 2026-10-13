import type { BackendMethods } from "@surgecast/protocol";
type Template = BackendMethods["ai.providers.templates"]["result"][number];
const openai = (
  id: string,
  name: string,
  baseUrl: string,
  needsApiKey = true,
): Template => ({ id, name, baseUrl, api: "openai", needsApiKey });
export const PROVIDER_TEMPLATES: Template[] = [
  openai("openai", "OpenAI", "https://api.openai.com/v1"),
  {
    id: "anthropic",
    name: "Anthropic",
    api: "anthropic",
    baseUrl: "https://api.anthropic.com",
    needsApiKey: true,
  },
  {
    id: "google",
    name: "Google Gemini",
    api: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    needsApiKey: true,
  },
  openai("openrouter", "OpenRouter", "https://openrouter.ai/api/v1"),
  openai("groq", "Groq", "https://api.groq.com/openai/v1"),
  openai("mistral", "Mistral", "https://api.mistral.ai/v1"),
  openai("xai", "xAI", "https://api.x.ai/v1"),
  openai("deepseek", "DeepSeek", "https://api.deepseek.com/v1"),
  openai("together", "Together", "https://api.together.xyz/v1"),
  openai("fireworks", "Fireworks", "https://api.fireworks.ai/inference/v1"),
  openai("perplexity", "Perplexity", "https://api.perplexity.ai"),
  openai("cerebras", "Cerebras", "https://api.cerebras.ai/v1"),
  {
    id: "ollama",
    name: "Ollama",
    api: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    needsApiKey: false,
  },
  openai("lmstudio", "LM Studio", "http://127.0.0.1:1234/v1", false),
  openai("cliproxyapi", "CLIProxyAPI", "http://127.0.0.1:8317/v1", false),
  openai("litellm", "LiteLLM", "http://127.0.0.1:4000/v1", false),
  openai(
    "azure",
    "Azure OpenAI",
    "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT?api-version=2024-10-21",
  ),
  openai(
    "custom",
    "Custom OpenAI-compatible",
    "http://127.0.0.1:8080/v1",
    false,
  ),
];
