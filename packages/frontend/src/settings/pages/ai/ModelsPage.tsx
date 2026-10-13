import type { AIProvider } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { errorMessage } from "../../../bridge/errors";
import { Button } from "../../../components/Button/Button";
import { Switch } from "../../../components/Switch/Switch";
import { showFailureToast } from "../../../components/feedback/toast-store";
import { Icon } from "../../../icons/Icon";
import { Image } from "../../../icons/Image";
import { navigate } from "../../navigation";
import { CardEmpty, Section } from "../../ui/layout";
import { PageFrame } from "../../ui/PageFrame";
import { AddProviderButton, OnboardingCard } from "./onboarding";
import { CAPABILITIES, formatContext, providerIcon, useEnabledModels } from "./shared";
import "./ai.css";

type ProviderRow = AIProvider & { hasApiKey: boolean };

function providerStatus(provider: ProviderRow, needsKey: boolean): { label: string; tone: "warning" | "error" | "neutral" } | null {
  if (!provider.enabled) return { label: "Off", tone: "neutral" };
  if (needsKey && !provider.hasApiKey) return { label: "Needs API Key", tone: "warning" };
  if (provider.modelFetchError) return { label: "Can't Load Models", tone: "error" };
  if (!provider.models.some((m) => m.enabled)) return { label: "No Models", tone: "warning" };
  return null;
}

function host(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, ""));
  } catch {
    return url;
  }
}

async function setProviderEnabled(provider: ProviderRow, enabled: boolean) {
  try {
    await backend.call("ai.providers.upsert", { provider: { id: provider.id, name: provider.name, template: provider.template, api: provider.api, baseUrl: provider.baseUrl, enabled } });
  } catch (error) {
    showFailureToast(enabled ? "Could not turn the provider on" : "Could not turn the provider off", error);
  }
}

function ProviderListRow({ provider, needsKey }: { provider: ProviderRow; needsKey: boolean }) {
  const status = providerStatus(provider, needsKey);
  const enabledModels = provider.models.filter((m) => m.enabled).length;
  return (
    <div className="sc-s-item sc-s-provider-row" data-setting-id={`provider-${provider.id}`}>
      <button type="button" className="sc-s-provider-row__main" onClick={() => navigate(`ai/providers/${provider.id}`)}>
        <Image source={providerIcon(provider.template, provider.name)} size={28} />
        <span className="sc-s-row__label">
          <span className="sc-s-row__title">
            {provider.name}
            {status && (
              <span className="sc-s-badge" data-tone={status.tone === "neutral" ? undefined : status.tone}>
                {status.label}
              </span>
            )}
          </span>
          <span className="sc-s-navrow__description sc-truncate">
            {host(provider.baseUrl)} · {enabledModels} of {provider.models.length} models
          </span>
        </span>
        <Icon name="chevron-right-small-16" size={16} className="sc-s-navrow__chevron" />
      </button>
      <Switch checked={provider.enabled} onChange={(enabled) => void setProviderEnabled(provider, enabled)} label={`Use ${provider.name}`} />
    </div>
  );
}

function EnabledModels() {
  const { data: models } = useEnabledModels();
  if (!models?.length) return null;
  return (
    <Section title="Available Models" description="Every enabled model from enabled providers. Turn models on or off on each provider's page.">
      {models.map((model) => (
        <div key={model.ref} className="sc-s-item sc-s-model-row" data-compact="">
          <span className="sc-s-row__label">
            <span className="sc-s-row__title sc-truncate">{model.name}</span>
            <span className="sc-s-navrow__description sc-truncate">{model.providerName}</span>
          </span>
          <span className="sc-s-capabilities">
            {CAPABILITIES.filter((c) => model.capabilities[c.key]).map((c) => (
              <span key={c.key} className="sc-s-capability" data-on="" title={c.title}>
                <Icon name={c.icon} size={12} />
                {c.title}
              </span>
            ))}
          </span>
          <span className="sc-s-model-row__context">{formatContext(model.contextWindow) ?? ""}</span>
        </div>
      ))}
    </Section>
  );
}

/** Settings → AI → Models & Providers. */
export function ModelsPage() {
  const { data: providers, isLoading, error, refetch } = useBackend("ai.providers.list", undefined);
  const { data: templates } = useBackend("ai.providers.templates", undefined);
  const needsKey = (template: string) => templates?.find((t) => t.id === template)?.needsApiKey ?? false;
  return (
    <PageFrame title="Models & Providers" titleMode="always">
      {!isLoading && !error && !providers?.length && <OnboardingCard />}
      <Section title="Providers" description="Surgecast sends prompts straight to these providers with your own keys." actions={<AddProviderButton />}>
        {providers?.length ? (
          providers.map((provider) => <ProviderListRow key={provider.id} provider={provider} needsKey={needsKey(provider.template)} />)
        ) : (
          <CardEmpty title={error ? "Couldn't Load Providers" : isLoading ? "Loading Providers…" : "No Providers Yet"} description={error ? errorMessage(error) : isLoading ? undefined : "Add a provider to use Quick AI, AI Chat and AI Commands."} action={Boolean(error) && <Button size="small" onClick={refetch}>Try Again</Button>} />
        )}
      </Section>
      <EnabledModels />
    </PageFrame>
  );
}
