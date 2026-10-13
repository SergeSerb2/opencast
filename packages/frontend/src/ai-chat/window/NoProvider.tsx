import { Button } from "../../components/Button/Button";
import { SurgecastLogo } from "../../icons/glyphs";

/** Shown instead of the conversation until an AI provider with a model is configured (BYOK only). */
export function NoProvider({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="sc-ai-no-provider" role="status">
      <SurgecastLogo size={48} className="sc-ai-no-provider__logo" />
      <div className="sc-ai-no-provider__text">
        <div className="sc-ai-no-provider__title">Add an AI Provider</div>
        <div className="sc-ai-no-provider__description">Surgecast talks to AI with your own keys. Add OpenAI, Anthropic, Google, Ollama or any OpenAI-compatible endpoint to start chatting.</div>
      </div>
      <Button onClick={onOpenSettings} icon="cog-16">
        Open AI Settings
      </Button>
    </div>
  );
}
