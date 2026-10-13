import { errorMessage } from "../../bridge/errors";
import { Button } from "../../components/Button/Button";
import { OpenCastLogo } from "../../icons/glyphs";
import "./no-provider.css";

/** Shown instead of the conversation until an AI provider with a model is configured (BYOK only). */
export function NoProvider({ onOpenSettings, error, onRetry }: { onOpenSettings: () => void; error?: unknown; onRetry?: () => void }) {
  return (
    <div className="sc-ai-no-provider" role="status">
      <OpenCastLogo size={48} className="sc-ai-no-provider__logo" />
      <div className="sc-ai-no-provider__text">
        <div className="sc-ai-no-provider__title">{error ? "Could not Load AI Models" : "Add an AI Provider"}</div>
        <div className="sc-ai-no-provider__description">{error ? errorMessage(error) : "OpenCast talks to AI with your own keys. Add OpenAI, Anthropic, Google, Ollama or any OpenAI-compatible endpoint to start chatting."}</div>
      </div>
      {Boolean(error) && onRetry && <Button onClick={onRetry} icon="arrow-clockwise-16">Retry</Button>}
      <Button onClick={onOpenSettings} icon="cog-16">
        Open AI Settings
      </Button>
    </div>
  );
}
