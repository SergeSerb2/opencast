import { useBackend } from "../../../bridge/hooks";
import { Button } from "../../../components/Button/Button";
import { Image } from "../../../icons/Image";
import { openUrl } from "../../actions";
import { LINKS } from "../../links";
import { navigate } from "../../navigation";
import { MenuButton } from "../../ui/MenuButton";
import { providerIcon } from "./shared";
import "./ai.css";

const LOCAL_TEMPLATES = new Set(["ollama", "lmstudio", "cliproxyapi", "litellm", "custom"]);

/** "Add Provider" menu listing the backend's provider templates. */
export function AddProviderButton({ variant = "default", label = "Add Provider" }: { variant?: "default" | "standout"; label?: string }) {
  const { data: templates } = useBackend("ai.providers.templates", undefined);
  const item = (t: { id: string; name: string }) => ({ id: t.id, title: t.name, icon: providerIcon(t.id, t.name) });
  return (
    <MenuButton
      variant={variant}
      width={260}
      searchable
      searchPlaceholder="Search providers…"
      sections={[
        { title: "Cloud Providers", items: (templates ?? []).filter((t) => !LOCAL_TEMPLATES.has(t.id)).map(item) },
        { title: "Local Models & Proxies", items: (templates ?? []).filter((t) => LOCAL_TEMPLATES.has(t.id)).map(item) },
      ]}
      onSelect={(selected) => navigate(`ai/providers/new/${selected.id}`)}
    >
      {label}
    </MenuButton>
  );
}

/** Explains bring-your-own-key AI and offers the fastest setups. */
export function OnboardingCard() {
  return (
    <div className="sc-s-card sc-s-onboarding">
      <div className="sc-s-onboarding__art" aria-hidden="true">
        <Image source={providerIcon("anthropic")} size={34} className="sc-s-onboarding__tile" />
        <Image source={providerIcon("openai")} size={34} className="sc-s-onboarding__tile" />
        <Image source={providerIcon("ollama")} size={34} className="sc-s-onboarding__tile" />
      </div>
      <div className="sc-s-onboarding__body">
        <div className="sc-s-onboarding__title">Bring your own AI</div>
        <p className="sc-s-onboarding__text">
          OpenCast talks directly to the providers you choose — nothing goes through OpenCast servers and there are no credits. Paste an API key from OpenAI, Anthropic, Google or OpenRouter, or
          point OpenCast at a local model or proxy. Keys stay in your Keychain.
        </p>
        <p className="sc-s-onboarding__text">
          Already pay for ChatGPT, Claude or Gemini?{" "}
          <button type="button" className="sc-s-link" onClick={() => openUrl(LINKS.cliProxyApi)}>
            CLIProxyAPI
          </button>{" "}
          turns those subscriptions into a local OpenAI-compatible server. Start it, sign in, then add it here — the URL is prefilled.
        </p>
        <div className="sc-s-onboarding__actions">
          <AddProviderButton variant="standout" />
          <Button size="small" variant="secondary" onClick={() => navigate("ai/providers/new/cliproxyapi")}>
            Set Up CLIProxyAPI
          </Button>
        </div>
      </div>
    </div>
  );
}
