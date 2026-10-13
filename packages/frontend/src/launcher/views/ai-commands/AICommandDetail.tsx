import { memo } from "react";
import type { AICommand, AIModelOption } from "@opencast/protocol";
import { ItemDetail, type MetadataEntry } from "../../../components";
import { creativityLabel, formatTimestamp, modelLabel, outputLabel, reasoningLabel, tagColor } from "../ai-shared/options";
import { promptArguments, tokenizePrompt } from "./placeholders";

/** Information rows of the detail pane, in Raycast's order (name, model, behavior, dates). */
export function commandMetadata(command: AICommand, models: AIModelOption[] | undefined, commandsModel: string | null | undefined): MetadataEntry[] {
  const entries: MetadataEntry[] = [
    { kind: "label", title: "Name", text: command.name },
    { kind: "label", title: "Type", text: command.builtin ? "Built-in" : "Custom" },
    { kind: "label", title: "Model", text: modelLabel(command.model, models, commandsModel) },
    { kind: "label", title: "Creativity", text: creativityLabel(command.creativity) },
  ];
  const reasoning = reasoningLabel(command.reasoningEffort);
  if (reasoning) entries.push({ kind: "label", title: "Reasoning Effort", text: reasoning });
  entries.push({ kind: "label", title: "Output", text: outputLabel(command.output) });
  const args = promptArguments(command.prompt);
  if (args.length) entries.push({ kind: "label", title: args.length === 1 ? "Argument" : "Arguments", text: args.map((a) => a.name).join(", ") });
  if (command.tags?.length) entries.push({ kind: "tags", title: "Tags", tags: command.tags.map((tag) => ({ text: tag, color: tagColor(tag) })) });
  entries.push({ kind: "label", title: "Highlight Edits", text: command.highlightEdits ? "Yes" : "No" });
  if (command.webSearch) entries.push({ kind: "label", title: "Web Search", text: "Yes" });
  entries.push({ kind: "label", title: "Created", text: formatTimestamp(command.createdAt) });
  if (command.updatedAt !== command.createdAt) entries.push({ kind: "label", title: "Modified", text: formatTimestamp(command.updatedAt) });
  return entries;
}

/** The prompt with its placeholders drawn as tokens. */
export const PromptPreview = memo(function PromptPreview({ prompt }: { prompt: string }) {
  return (
    <div className="sc-ai-prompt-preview">
      {tokenizePrompt(prompt).map((segment, i) =>
        segment.kind === "placeholder" ? (
          <span key={i} className={segment.invalid ? "sc-ai-placeholder sc-ai-placeholder--invalid" : "sc-ai-placeholder"}>
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </div>
  );
});

export function AICommandDetail({ command, models, commandsModel }: { command: AICommand; models: AIModelOption[] | undefined; commandsModel: string | null | undefined }) {
  return <ItemDetail preview={<PromptPreview prompt={command.prompt} />} metadata={commandMetadata(command, models, commandsModel)} />;
}
