import { useEffect, useMemo, useRef, useState } from "react";
import type { AIModel, AIProvider } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { Button, IconButton } from "../../../components/Button/Button";
import { Checkbox } from "../../../components/Checkbox/Checkbox";
import { Spinner } from "../../../components/Spinner/Spinner";
import { Switch } from "../../../components/Switch/Switch";
import { TextField } from "../../../components/TextField/TextField";
import { confirmAlert } from "../../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../../components/feedback/toast-store";
import { Icon } from "../../../icons/Icon";
import { Image } from "../../../icons/Image";
import { openUrl } from "../../actions";
import { navigate } from "../../navigation";
import { Select } from "../../ui/controls";
import { Dialog, DialogField } from "../../ui/Dialog";
import { Callout, CardEmpty, Controls, Row, Section } from "../../ui/layout";
import { MenuButton } from "../../ui/MenuButton";
import { PageFrame } from "../../ui/PageFrame";
import {
  API_LABELS,
  draftFromProvider,
  draftFromTemplate,
  draftToUpsert,
  hasErrors,
  supportedApis,
  validateProviderDraft,
  reconcileProviderDraft,
  type ProviderDraft,
  type ProviderDraftErrors,
  type ProviderTemplate,
} from "./provider-form";
import { CAPABILITIES, formatContext, providerIcon } from "./shared";
import "./ai.css";

type ProviderRow = AIProvider & { hasApiKey: boolean };

const API_HELP: Partial<Record<string, string>> = {
  "openai-responses": "Responses supports reasoning summaries and native PDFs. Chat Completions works with every OpenAI-compatible server.",
  openai: "Chat Completions works with every OpenAI-compatible server.",
  ollama: "Ollama's native API discovers installed models with their capabilities.",
};

/** Setup notes shown when adding a provider from these templates. */
const TEMPLATE_HINTS: Record<string, string> = {
  cliproxyapi: "Start CLIProxyAPI and sign in with your ChatGPT, Claude or Gemini account (see its README). If you set api-keys in its config.yaml, paste one of them as the API key.",
  ollama: "Install Ollama and pull at least one model, e.g. `ollama pull llama3.2`. Surgecast lists the models you have installed.",
  lmstudio: "In LM Studio, open the Developer tab and start the local server with a model loaded.",
  litellm: "Point Surgecast at your LiteLLM proxy. Use a virtual key as the API key if your proxy requires one.",
  azure: "Put your resource name and deployment in the URL. The API key is under Keys and Endpoint in the Azure portal.",
  custom: "Any server that implements the OpenAI API works, including vLLM, llama.cpp server, Jan and LocalAI.",
};

function ApiKeyRow({
  draft,
  setDraft,
  template,
  hasSavedKey,
  error,
}: {
  draft: ProviderDraft;
  setDraft: (patch: Partial<ProviderDraft>) => void;
  template?: ProviderTemplate;
  hasSavedKey: boolean;
  error?: string;
}) {
  const [replacing, setReplacing] = useState(false);
  const saved = hasSavedKey && !draft.removeApiKey && !replacing;
  const description = error ? (
    <span className="sc-s-missing">{error}</span>
  ) : template?.needsApiKey ? (
    "Stored in your Keychain on this Mac. It never syncs and is never shown again."
  ) : (
    "Optional — only if your server requires one. Stored in your Keychain."
  );
  return (
    <Row title="API Key" description={description}>
      {saved ? (
        <Controls>
          <span className="sc-s-badge" data-tone="success">
            Saved in Keychain
          </span>
          <Button size="small" variant="ghost" onClick={() => setReplacing(true)}>
            Replace
          </Button>
          <Button size="small" variant="ghost" onClick={() => setDraft({ removeApiKey: true, apiKey: "" })}>
            Remove
          </Button>
        </Controls>
      ) : (
        <Controls>
          {template?.keyUrl && (
            <Button size="small" variant="ghost" onClick={() => openUrl(template.keyUrl as string)}>
              Get Key
            </Button>
          )}
          <span className="sc-s-key-field">
            <TextField
              size="small"
              type="password"
              value={draft.apiKey}
              onChange={(apiKey) => setDraft({ apiKey })}
              placeholder={draft.removeApiKey ? "Key will be removed" : "Paste API key"}
              validation={error ? "error" : undefined}
              aria-label="API Key"
            />
          </span>
          {(replacing || draft.removeApiKey) && (
            <IconButton
              icon="arrow-counter-clockwise-16"
              label="Keep Saved Key"
              onClick={() => {
                setReplacing(false);
                setDraft({ apiKey: "", removeApiKey: false });
              }}
            />
          )}
        </Controls>
      )}
    </Row>
  );
}

function HeadersRow({ draft, setDraft, errors }: { draft: ProviderDraft; setDraft: (patch: Partial<ProviderDraft>) => void; errors?: Record<number, string> }) {
  const update = (index: number, patch: Partial<ProviderDraft["headers"][number]>) => setDraft({ headers: draft.headers.map((h, i) => (i === index ? { ...h, ...patch } : h)) });
  return (
    <Row title="Extra Headers" description="Sent with every request, e.g. an organization or project header. Values are stored in your Keychain." layout="stacked">
      {draft.headers.length === 0 ? (
        <span>
          <Button size="small" icon="plus-16" onClick={() => setDraft({ headers: [{ name: "", value: "", stored: false }] })}>
            Add Header
          </Button>
        </span>
      ) : (
        <div className="sc-s-applist">
          {draft.headers.map((header, index) => (
            <div key={index} className="sc-s-applist__item sc-s-header-row">
              <span className="sc-s-header-row__name">
                <TextField
                  size="small"
                  value={header.name}
                  onChange={(name) => update(index, { name, stored: name === header.name && header.stored })}
                  placeholder="Header-Name"
                  validation={errors?.[index] ? "error" : undefined}
                  aria-label="Header name"
                />
              </span>
              <span className="sc-s-header-row__value">
                <TextField
                  size="small"
                  type="password"
                  value={header.value}
                  onChange={(value) => update(index, { value })}
                  placeholder={header.stored ? "Saved in Keychain" : "Value"}
                  validation={errors?.[index] ? "error" : undefined}
                  aria-label="Header value"
                />
              </span>
              <IconButton icon="minus-circle-16" label="Remove Header" onClick={() => setDraft({ headers: draft.headers.filter((_, i) => i !== index) })} />
              {errors?.[index] && <span className="sc-s-header-row__error">{errors[index]}</span>}
            </div>
          ))}
          <div className="sc-s-applist__footer">
            <Button size="small" icon="plus-16" onClick={() => setDraft({ headers: [...draft.headers, { name: "", value: "", stored: false }] })}>
              Add Header
            </Button>
          </div>
        </div>
      )}
    </Row>
  );
}

function ConnectionSection({
  draft,
  setDraft,
  errors,
  template,
  hasSavedKey,
  isNew,
  version,
}: {
  draft: ProviderDraft;
  setDraft: (patch: Partial<ProviderDraft>) => void;
  errors: ProviderDraftErrors;
  template?: ProviderTemplate;
  hasSavedKey: boolean;
  isNew: boolean;
  version?: number;
}) {
  const apis = supportedApis(template, draft.api);
  return (
    <Section title="Connection">
      <Row title="Name" description={errors.name ? <span className="sc-s-missing">{errors.name}</span> : undefined}>
        <span className="sc-s-key-field">
          <TextField size="small" value={draft.name} onChange={(name) => setDraft({ name })} validation={errors.name ? "error" : undefined} aria-label="Name" />
        </span>
      </Row>
      {apis.length > 1 && (
        <Row title="API Format" description={API_HELP[draft.api]}>
          <Select value={draft.api} options={apis.map((api) => ({ value: api, title: API_LABELS[api] }))} onChange={(api) => setDraft({ api })} label="API Format" />
        </Row>
      )}
      <Row
        title="Base URL"
        description={
          errors.baseUrl ? (
            <span className="sc-s-missing">{errors.baseUrl}</span>
          ) : template && draft.baseUrl !== template.baseUrl ? (
            `Default: ${template.baseUrl}`
          ) : (
            "Change it to use a proxy, gateway or self-hosted endpoint."
          )
        }
      >
        <Controls>
          {template && draft.baseUrl !== template.baseUrl && <IconButton icon="arrow-counter-clockwise-16" label="Reset to Default" onClick={() => setDraft({ baseUrl: template.baseUrl })} />}
          <span className="sc-s-url-field">
            <TextField size="small" value={draft.baseUrl} onChange={(baseUrl) => setDraft({ baseUrl })} validation={errors.baseUrl ? "error" : undefined} aria-label="Base URL" />
          </span>
        </Controls>
      </Row>
      <ApiKeyRow key={`${version}-${hasSavedKey}`} draft={draft} setDraft={setDraft} template={template} hasSavedKey={hasSavedKey} error={errors.apiKey} />
      <HeadersRow draft={draft} setDraft={setDraft} errors={errors.headers} />
      <Row title="Load Models Automatically" description="Fetch the model list from the provider now and every few hours. Models you add by hand are kept.">
        <Switch checked={draft.autoFetchModels} onChange={(autoFetchModels) => setDraft({ autoFetchModels })} label="Load Models Automatically" />
      </Row>
      {!isNew && (
        <Row title="Enabled" description="Turn off to hide this provider's models everywhere without deleting it.">
          <Switch checked={draft.enabled} onChange={(enabled) => setDraft({ enabled })} label="Enabled" />
        </Row>
      )}
    </Section>
  );
}

function TestConnection({ provider, dirty }: { provider: ProviderRow; dirty: boolean }) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "testing" } | { kind: "done"; ok: boolean; message: string; latencyMs?: number }>({ kind: "idle" });
  const test = async () => {
    setState({ kind: "testing" });
    try {
      const result = await backend.call("ai.providers.test", { id: provider.id });
      setState({ kind: "done", ...result });
    } catch (error) {
      setState({ kind: "done", ok: false, message: errorMessage(error) });
    }
  };
  const description =
    state.kind === "done" ? (
      <span className={state.ok ? "sc-s-ok" : "sc-s-missing"}>
        {state.message}
        {state.ok && state.latencyMs !== undefined ? ` · ${state.latencyMs} ms` : ""}
      </span>
    ) : dirty ? (
      "Save your changes first — the test uses the saved settings."
    ) : (
      "Send a small request with the saved settings."
    );
  return (
    <Row title="Test Connection" description={description}>
      <Button size="small" onClick={() => void test()} disabled={dirty || state.kind === "testing"}>
        {state.kind === "testing" ? <Spinner size={12} /> : null}
        {state.kind === "testing" ? "Testing…" : "Test"}
      </Button>
    </Row>
  );
}

function AddModelDialog({ existing, onClose, onAdd }: { existing: readonly AIModel[]; onClose: () => void; onAdd: (model: AIModel) => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [capabilities, setCapabilities] = useState<AIModel["capabilities"]>({ tools: true });
  const [error, setError] = useState<{ id?: string; context?: string }>({});
  const submit = () => {
    const modelId = id.trim();
    const problems: typeof error = {};
    if (!modelId) problems.id = "Enter the model ID the provider expects";
    else if (existing.some((m) => m.id === modelId)) problems.id = "This provider already has that model";
    const contextWindow = context.trim() ? Number(context.replace(/[,_\s]/g, "")) : undefined;
    if (contextWindow !== undefined && (!Number.isInteger(contextWindow) || contextWindow < 1)) problems.context = "Enter a whole number of tokens";
    setError(problems);
    if (Object.keys(problems).length) return;
    onAdd({ id: modelId, name: name.trim() || modelId, contextWindow, capabilities, enabled: true, manual: true });
  };
  return (
    <Dialog
      title="Add Model"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Add Model</Button>
        </>
      }
    >
      <DialogField label="Model ID" hint="Exactly as the provider names it, e.g. gpt-5.1 or anthropic/claude-sonnet-5-5." error={error.id}>
        <TextField value={id} onChange={setId} placeholder="model-id" />
      </DialogField>
      <DialogField label="Display Name">
        <TextField value={name} onChange={setName} placeholder="Same as ID" />
      </DialogField>
      <DialogField label="Context Window (tokens)" error={error.context}>
        <TextField value={context} onChange={setContext} placeholder="Unknown" />
      </DialogField>
      <DialogField label="Capabilities">
        <div className="sc-s-checklist__items sc-s-checklist__items--flat">
          {CAPABILITIES.map((c) => (
            <Checkbox key={c.key} checked={Boolean(capabilities[c.key])} onChange={(on) => setCapabilities({ ...capabilities, [c.key]: on })} label={c.title} />
          ))}
        </div>
      </DialogField>
    </Dialog>
  );
}

function ModelRow({ model, onChange, onRemove, saving }: { model: AIModel; onChange: (model: AIModel) => void; onRemove?: () => void; saving: boolean }) {
  return (
    <div className="sc-s-item sc-s-model-row" data-disabled={!model.enabled || undefined}>
      <Switch checked={model.enabled} onChange={(enabled) => onChange({ ...model, enabled })} label={`Use ${model.name}`} disabled={saving} />
      <span className="sc-s-row__label">
        <span className="sc-s-row__title sc-truncate">{model.name}</span>
        {model.name !== model.id && <span className="sc-s-navrow__description sc-truncate">{model.id}</span>}
      </span>
      <span className="sc-s-capabilities">
        {CAPABILITIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className="sc-s-capability"
            data-on={model.capabilities[c.key] || undefined}
            aria-pressed={Boolean(model.capabilities[c.key])}
            disabled={saving}
            title={`${c.title}: ${model.capabilities[c.key] ? "on" : "off"} — click to change`}
            onClick={() => onChange({ ...model, capabilities: { ...model.capabilities, [c.key]: !model.capabilities[c.key] } })}
          >
            <Icon name={c.icon} size={12} />
            {c.title}
          </button>
        ))}
      </span>
      <span className="sc-s-model-row__context">{formatContext(model.contextWindow) ?? ""}</span>
      {onRemove ? <IconButton icon="minus-circle-16" label={`Remove ${model.name}`} onClick={onRemove} disabled={saving} /> : <span className="sc-s-model-row__spacer" />}
    </div>
  );
}

function ModelsSection({ provider }: { provider: ProviderRow }) {
  const [models, setModels] = useState(provider.models);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => setModels(provider.models), [provider.models]);

  const save = async (next: AIModel[]) => {
    if (saving) return;
    const previous = models;
    setSaving(true);
    setModels(next);
    try {
      await backend.call("ai.providers.upsert", { provider: { id: provider.id, name: provider.name, template: provider.template, api: provider.api, baseUrl: provider.baseUrl, models: next } });
    } catch (error) {
      setModels(previous);
      showFailureToast("Could not update models", error);
    } finally { setSaving(false); }
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      const updated = await backend.call("ai.providers.refreshModels", { id: provider.id });
      showToast({
        style: updated.modelFetchError ? "failure" : "success",
        title: updated.modelFetchError ? "Could not load models" : `${updated.models.length} models`,
        message: updated.modelFetchError,
      });
    } catch (error) {
      showFailureToast("Could not load models", error);
    } finally {
      setRefreshing(false);
    }
  };

  const q = query.trim().toLowerCase();
  const visible = q ? models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : models;
  const enabledCount = models.filter((m) => m.enabled).length;
  return (
    <Section
      title="Models"
      description={`${enabledCount} of ${models.length} enabled. Click a capability to correct it if the provider reports it wrong.`}
      actions={
        <Controls>
          {models.length > 8 && (
            <span className="sc-s-model-search">
              <TextField size="small" leadingIcon="magnifying-glass-16" value={query} onChange={setQuery} placeholder="Filter models" aria-label="Filter models" />
            </span>
          )}
          <MenuButton
            icon="ellipsis-16"
            label="Model Actions"
            disabled={saving || refreshing}
            width={210}
            sections={[
              {
                items: [
                  { id: "refresh", title: refreshing ? "Loading Models…" : "Reload Models", icon: "arrow-clockwise-16", disabled: refreshing },
                  { id: "add", title: "Add Model…", icon: "plus-16" },
                ],
              },
              {
                items: [
                  { id: "enable-all", title: "Enable All", icon: "check-circle-16", disabled: enabledCount === models.length },
                  { id: "disable-all", title: "Disable All", icon: "circle-disabled-16", disabled: enabledCount === 0 },
                ],
              },
            ]}
            onSelect={(item) => {
              if (item.id === "refresh") void refresh();
              if (item.id === "add") setAdding(true);
              if (item.id === "enable-all") void save(models.map((m) => ({ ...m, enabled: true })));
              if (item.id === "disable-all") void save(models.map((m) => ({ ...m, enabled: false })));
            }}
          />
        </Controls>
      }
      card={false}
    >
      {provider.modelFetchError && (
        <Callout
          tone="error"
          title="Couldn't load models"
          actions={
            <Button size="small" onClick={() => void refresh()} disabled={refreshing}>
              Retry
            </Button>
          }
        >
          {provider.modelFetchError}
        </Callout>
      )}
      <div className="sc-s-card">
        {visible.length ? (
          visible.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              saving={saving || refreshing}
              onChange={(next) => void save(models.map((m) => (m.id === next.id ? next : m)))}
              onRemove={model.manual ? () => void save(models.filter((m) => m.id !== model.id)) : undefined}
            />
          ))
        ) : (
          <CardEmpty
            title={query ? "No Matching Models" : refreshing ? "Loading Models…" : "No Models"}
            description={query ? undefined : "Reload the model list or add a model by its ID."}
            action={
              !query && (
                <Button size="small" onClick={() => setAdding(true)}>
                  Add Model…
                </Button>
              )
            }
          />
        )}
      </div>
      {adding && (
        <AddModelDialog
          existing={models}
          onClose={() => setAdding(false)}
          onAdd={(model) => {
            setAdding(false);
            void save([...models, model]);
          }}
        />
      )}
    </Section>
  );
}

async function deleteProvider(provider: ProviderRow) {
  const confirmed = await confirmAlert({
    title: `Delete ${provider.name}?`,
    message: "Its models disappear from every picker, and its API key is removed from your Keychain.",
    primaryAction: { title: "Delete Provider", style: "destructive" },
  });
  if (!confirmed) return;
  try {
    await backend.call("ai.providers.delete", { id: provider.id });
    navigate("ai/models", { replace: true });
  } catch (error) {
    showFailureToast("Could not delete provider", error);
  }
}

/** Add (route `ai/providers/new/<template>`) or edit (`ai/providers/<id>`) one AI provider. */
export function ProviderPage({ id, templateId }: { id?: string; templateId?: string }) {
  const { data: providers, isLoading: providersLoading, error: providersError } = useBackend("ai.providers.list", undefined);
  const { data: templates, isLoading: templatesLoading, error: templatesError } = useBackend("ai.providers.templates", undefined);
  const isLoading = providersLoading || templatesLoading;
  const loadError = providersError ?? templatesError;
  const provider = id ? providers?.find((p) => p.id === id) : undefined;
  const template = templates?.find((t) => t.id === (provider?.template ?? templateId));
  const [draft, setDraftState] = useState<ProviderDraft | null>(null);
  const [errors, setErrors] = useState<ProviderDraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isNew = !id;
  const previousBaseline = useRef<ProviderDraft | null>(null);

  const baseline = useMemo(() => (provider ? draftFromProvider(provider) : template ? draftFromTemplate(template) : null), [provider, template]);
  useEffect(() => {
    if (!baseline) return;
    const previous = previousBaseline.current;
    setDraftState((current) => reconcileProviderDraft(current, previous, baseline));
    previousBaseline.current = baseline;
  }, [baseline]);

  const setDraft = (patch: Partial<ProviderDraft>) => {
    if (saving) return;
    setDraftState((current) => (current ? { ...current, ...patch } : current));
    setErrors({});
    setSaveError(null);
  };
  const dirty = Boolean(draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline));

  if (!draft || (!provider && !isNew)) {
    return (
      <PageFrame title="Provider" titleMode="always">
        <div className="sc-s-card">
          <CardEmpty
            title={loadError ? "Couldn't Load Provider" : isLoading ? "Loading…" : isNew ? "Unknown Provider Template" : "Provider Not Found"}
            description={loadError ? errorMessage(loadError) : isLoading ? undefined : "It may have been deleted on another Mac."}
            action={
              !isLoading && (
                <Button size="small" onClick={() => navigate("ai/models", { replace: true })}>
                  Show Providers
                </Button>
              )
            }
          />
        </div>
      </PageFrame>
    );
  }

  const save = async () => {
    const problems = validateProviderDraft(draft, template, provider?.hasApiKey ?? false);
    setErrors(problems);
    if (hasErrors(problems)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await backend.call("ai.providers.upsert", draftToUpsert(draft));
      setDraftState(draftFromProvider(saved));
      if (isNew) {
        navigate(`ai/providers/${saved.id}`, { replace: true });
        showToast({ style: saved.modelFetchError ? "failure" : "success", title: `Added ${saved.name}`, message: saved.modelFetchError ?? `${saved.models.length} models available` });
      } else showToast({ style: "success", title: "Provider saved" });
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const headerActions =
    dirty || isNew ? (
      <Controls>
        <Button size="small" variant="ghost" disabled={saving} onClick={() => (isNew ? navigate("ai/models", { replace: true }) : setDraftState(baseline))}>
          {isNew ? "Cancel" : "Revert"}
        </Button>
        <Button size="small" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : isNew ? "Add Provider" : "Save Changes"}
        </Button>
      </Controls>
    ) : undefined;
  const hint = TEMPLATE_HINTS[draft.template];

  return (
    <PageFrame title={isNew ? `Add ${template?.name ?? "Provider"}` : (provider?.name ?? "Provider")} titleMode="always" actions={headerActions}>
      <div className="sc-s-provider-head">
        <Image source={providerIcon(draft.template, draft.name)} size={40} />
        <div className="sc-s-provider-head__text">
          <div className="sc-s-provider-head__title">{isNew ? `Add ${template?.name ?? "Provider"}` : draft.name}</div>
          <div className="sc-s-provider-head__subtitle">{template ? `${template.name} · ${API_LABELS[draft.api]}` : API_LABELS[draft.api]}</div>
        </div>
      </div>
      {saveError && (
        <Callout tone="error" title={isNew ? "Couldn't add the provider" : "Couldn't save the provider"}>
          {saveError}
        </Callout>
      )}
      {isNew && hint && (
        <Callout tone="info" title="Before you add it">
          {hint}
        </Callout>
      )}
      <fieldset disabled={saving} className="sc-s-provider-fields">
        <ConnectionSection draft={draft} setDraft={setDraft} errors={errors} template={template} hasSavedKey={provider?.hasApiKey ?? false} isNew={isNew} version={provider?.updatedAt} />
      </fieldset>
      {provider && (
        <>
          <Section anchor="test">
            <TestConnection provider={provider} dirty={dirty} />
          </Section>
          <ModelsSection provider={provider} />
          <Section title="Danger Zone">
            <Row title="Delete Provider" description="Remove this provider, its models and its API key.">
              <Button size="small" variant="destructive" onClick={() => void deleteProvider(provider)}>
                Delete…
              </Button>
            </Row>
          </Section>
        </>
      )}
    </PageFrame>
  );
}
