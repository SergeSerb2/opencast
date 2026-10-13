# AI backend

`aiService.register(ctx)` installs `CompletionEngine` as `ctx.ai` and registers all
AI RPC methods. Every completion, including titles and extension `AI.ask`, uses
an explicitly configured, enabled provider/model. No environment keys are imported,
no account or credit checks exist, and no hosted Surgecast/Raycast fallback exists.

## Modules

- `providers.ts`, `templates.ts`: 18 provider templates, Keychain credentials,
  native model catalogs, pagination, manual models, capability inference/overrides,
  per-purpose defaults, automatic model refresh and fetch error reporting.
- `request-mapping.ts`, `adapters.ts`, `sse.ts`: OpenAI-compatible, Anthropic,
  Gemini, and Ollama request projection and abortable streaming. Wire tool names
  use stable hashes because provider name grammars do not accept every registry
  name. Signed thinking/function parts are replayed only to their source model.
- `attachments.ts`: local image/text snapshots, native Anthropic/Gemini PDFs,
  and deliberately limited extraction of trivial text PDFs for other endpoints.
- `engine.ts`: schema-validated, confirmation-aware tool loop (12 model rounds),
  token usage, finish reasons, and durable provider-neutral turn snapshots.
- `chats.ts`: branching, queued sends, streaming persistence with a 100 ms trailing
  flush, cancellation/approval, profile/preset/system context, titles, export,
  startup interruption recovery, and hourly archiving. Deleted chats cannot be
  resurrected by a late stream callback. Pinned or active chats are not archived.
- `commands.ts`, `seeds.ts`, `placeholders.ts`: editable/resettable built-ins and
  classic commands with original prompts, presets, command providers, Raycast JSON
  import/export, native outputs, and placeholder/argument/modifier resolution.
- `web.ts`, `tools.ts`, `mcp.ts`: configured web search/read, native system tools,
  lazy MCP stdio/Streamable HTTP connections, status, and Claude Desktop JSON import.

## Frontend and extension integration

`ai.chats.send` acknowledges with IDs before emitting `ai.stream` events. Ordinary
follow-ups queue in the same chat; edits/regenerations require stopping its active
run. `ai.chats.get` returns all branches; follow `parentId` from `currentLeafId` for
the visible transcript. `ai.ask` returns the stored Quick AI chat ID, and the same
chat can be opened in Chat by updating its `source` to `chat`.

An `awaiting-confirmation` tool call is resumed by `ai.confirmTool`. Approval with
`always: true` updates the user's allowlist. Stopping a run cancels pending approval
and never runs its write action. Completed tool turns persist even when a subsequent
model round stops. Unrecorded outcomes are explicitly marked unknown during replay.

Provider API keys use `ai.provider:<id>:apiKey`. Custom header values use
`ai.provider:<id>:header:<name>` and only their names appear in `secretHeaders`.
To retain a masked custom header during editing, pass `$keychain` as its value.
MCP env/header values similarly use `mcp:<id>:env:<name>` and
`mcp:<id>:header:<name>`; synced metadata contains `$keychain` markers, never values.
Keys must be configured separately on each synced device. URL credentials are rejected.

Models with `autoFetchModels` refresh after explicit setup, on startup, and every
three hours; failures preserve the existing models and set `modelFetchError`.
Fetched models merge with user overrides, preserve manual models, and disable
models that disappear. `ai.searchAgents` controls preset visibility in root search
and defaults to false. Date/time placeholders are a deliberate Surgecast addition.
Clipboard offsets use the core service's local clipboard history RPC.

Known OpenAI context defaults follow [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1), [GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o), and [GPT-5](https://developers.openai.com/api/docs/models/gpt-5). Unknown models have no guessed context limit. For reasoning models that cannot disable reasoning, the no-reasoning choice uses the lowest documented effort.

The adapters follow the provider protocols documented by
[Anthropic](https://platform.claude.com/docs/en/build-with-claude/streaming) and
[Gemini](https://ai.google.dev/gemini-api/docs/function-calling), using the installed
[MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) for MCP transports.

## Verification

From the worktree root:

```sh
pnpm --filter @surgecast/backend typecheck
pnpm --filter @surgecast/backend test
pnpm --filter @surgecast/backend build
node packages/backend/test/ai/smoke.mjs
```

The tests use mocked fetch, real SQLite, fake native/Keychain calls, and local stdio
and HTTP MCP servers. The standalone smoke test launches the built backend with
`--no-native` and a loopback HTTP/SSE provider, then verifies actual WebSocket events,
model discovery, stored messages, title generation, follow-ups, export and Quick AI.
Its temporary database, mock server, and backend process are cleaned up afterwards.

## Limits

- The OpenAI adapter uses Chat Completions as specified; a Responses adapter is not included. GPT-6 tools are conservatively disabled by inference because [official OpenAI guidance](https://developers.openai.com/api/docs/guides/latest-model#gpt-6-astra-update-api-and-model-parameters) requires Responses for reasoning with tools; custom compatibility bridges can explicitly override the capability.
- System proxy settings are not integrated; global Node fetch is used as permitted.
- Scanned/encrypted/complex PDFs require a document-capable model or extracted UTF-8
  text; unsupported input produces an explicit error.
- MCP supports stdio and Streamable HTTP with configured headers. Legacy SSE and an
  interactive OAuth onboarding flow are outside the current protocol contract.
- Browser context requires macOS Automation permission and a focused supported
  browser. Paste/replace and selection require the Swift host's Accessibility support.
  Native integration and real vendor calls still need acceptance testing; automated
  tests intentionally do not use personal credentials or external AI services.
- Website extraction reads the fetched public HTML; authenticated pages or content
  rendered only by client-side JavaScript need explicitly supplied context.
