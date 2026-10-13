import { useBackend } from "../../../bridge/hooks";
import { errorMessage } from "../../../bridge/errors";
import { Detail } from "../../../components";

export function SnippetPreview({ text }: { text: string }) {
  const { data, error, isLoading } = useBackend("snippets.render", { text });
  return (
    <Detail navigationTitle="Snippet Preview" isLoading={isLoading}>
      <div className="sc-snippet-preview-view">
        {error ? <p role="alert">{errorMessage(error)}</p> : <pre className="sc-snippet-rendered-preview">{data?.text}</pre>}
        {!!data?.arguments.length && <p className="sc-text-small sc-color-secondary">Arguments use their default values in this preview. You’ll enter them when you paste or copy.</p>}
      </div>
    </Detail>
  );
}
