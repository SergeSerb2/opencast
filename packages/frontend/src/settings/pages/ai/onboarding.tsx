import { useCallback, useEffect, useRef, useState } from "react";
import type { BackendResult } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
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

type Detection = BackendResult<"ai.providers.detectLocal">[number];
let pendingSetup: Detection | undefined;

export function openDetectedProvider(detection: Detection) {
  pendingSetup = detection;
  navigate(`ai/providers/new/${detection.templateId}`);
}

export function detectedSetup(templateId?: string) {
  return pendingSetup?.templateId === templateId ? pendingSetup : undefined;
}

export function clearDetectedSetup() {
  pendingSetup = undefined;
}

/** One scan per settings visit, plus explicit Detect clicks. No reconnect or polling scans. */
export function useLocalDetection() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const detect = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      setDetections(await backend.call("ai.providers.detectLocal"));
    } catch {
      setDetections([]);
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => { void detect(); }, [detect]);
  return { detections, busy, error, detect };
}

type LocalDetection = ReturnType<typeof useLocalDetection>;

/** "Add Provider" menu listing the backend's provider templates. */
export function AddProviderButton({ variant = "default", label = "Add Provider", detections = [] }: { variant?: "default" | "standout"; label?: string; detections?: Detection[] }) {
  const { data: templates } = useBackend("ai.providers.templates", undefined);
  const item = (t: { id: string; name: string }) => ({ id: t.id, title: t.name, icon: providerIcon(t.id, t.name) });
  return (
    <MenuButton
      variant={variant}
      width={260}
      searchable
      searchPlaceholder="Search providers…"
      sections={[
        ...(detections.length ? [{ title: "Detected on This Mac", items: detections.map((d) => {
          const t = templates?.find((t) => t.id === d.templateId);
          return { id: `detected:${d.templateId}`, title: `${t?.name ?? d.templateId}${d.status === "auth-required" ? " — Key Required" : ` · ${d.modelCount} model${d.modelCount === 1 ? "" : "s"}`}`, icon: providerIcon(d.templateId), keywords: [d.baseUrl] };
        }) }] : []),
        { title: "Cloud Providers", items: (templates ?? []).filter((t) => !LOCAL_TEMPLATES.has(t.id)).map(item) },
        { title: "Local Models & Proxies", items: (templates ?? []).filter((t) => LOCAL_TEMPLATES.has(t.id)).map(item) },
      ]}
      onSelect={(selected) => {
        const detection = detections.find((d) => selected.id === `detected:${d.templateId}`);
        if (detection) openDetectedProvider(detection);
        else { clearDetectedSetup(); navigate(`ai/providers/new/${selected.id}`); }
      }}
    >
      {label}
    </MenuButton>
  );
}

/** Explains bring-your-own-key AI and offers the fastest setups. */
export function OnboardingCard({ local, showDetection = true }: { local: LocalDetection; showDetection?: boolean }) {
  const { data: templates } = useBackend("ai.providers.templates", undefined);
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
          point OpenCast at a local model or proxy. Keys stay in your Keychain. Keys you copy may appear in Clipboard History on this Mac.
        </p>
        <p className="sc-s-onboarding__text">
          Already pay for ChatGPT, Claude or Gemini?{" "}
          <button type="button" className="sc-s-link" onClick={() => openUrl(LINKS.cliProxyApi)}>
            CLIProxyAPI
          </button>{" "}
          turns those subscriptions into a local OpenAI-compatible server. Start it, sign in, then add it here — the URL is prefilled.
        </p>
        {showDetection && (
          <div className="sc-s-onboarding__detection">
            <span className="sc-s-navrow__description">{local.busy ? "Looking for local servers…" : local.error ? "Could not detect local servers." : local.detections.length ? "Detected on This Mac" : "No local servers found."}</span>
            {local.detections.map((d) => (
              <Button key={d.templateId} size="small" variant="secondary" onClick={() => openDetectedProvider(d)}>
                {templates?.find((t) => t.id === d.templateId)?.name ?? d.templateId}{d.status === "auth-required" ? " · Key Required" : ` · ${d.modelCount} model${d.modelCount === 1 ? "" : "s"}`}
              </Button>
            ))}
            <Button size="small" variant="ghost" onClick={() => void local.detect()} disabled={local.busy}>Detect</Button>
          </div>
        )}
        <div className="sc-s-onboarding__actions">
          <AddProviderButton variant="standout" detections={local.detections} />
          <Button size="small" variant="secondary" onClick={() => navigate("ai/providers/new/cliproxyapi")}>
            Set Up CLIProxyAPI
          </Button>
        </div>
      </div>
    </div>
  );
}
