import { useMemo } from "react";
import type { ImageLike } from "@opencast/protocol";
import { useBackend } from "../../../bridge/hooks";
import { Action, ActionPanel, Detail, type MetadataEntry } from "../../../components";
import { exportSummary, formatBytes } from "./import-export";

export interface ExportAICommandsProps {
  navigationTitle?: string;
  navigationIcon?: ImageLike;
}

/**
 * Export AI Commands: the JSON `ai.commands.export` produces, ready to copy.
 * (There is no native save dialog, so the export is copied or pasted.)
 */
export function ExportAICommands({ navigationTitle, navigationIcon }: ExportAICommandsProps) {
  const { data, isLoading, error } = useBackend("ai.commands.export", undefined);
  const json = data?.json ?? "";
  const metadata = useMemo<MetadataEntry[]>(() => {
    if (!json) return [];
    const summary = exportSummary(json);
    return [
      { kind: "label", title: "AI Commands", text: String(summary.total) },
      { kind: "label", title: "Custom", text: String(summary.custom) },
      { kind: "label", title: "Built-in", text: String(summary.builtin) },
      { kind: "label", title: "Size", text: formatBytes(summary.bytes) },
      { kind: "label", title: "Format", text: "JSON" },
    ];
  }, [json]);

  const markdown = error ? `**Couldn't export AI commands.**\n\n${error instanceof Error ? error.message : String(error)}` : json ? `\`\`\`json\n${json}\n\`\`\`` : null;

  return (
    <Detail
      navigationTitle={navigationTitle ?? "Export AI Commands"}
      navigationIcon={navigationIcon}
      isLoading={isLoading}
      markdown={markdown}
      metadata={metadata}
      actions={
        json ? (
          <ActionPanel title="Export AI Commands">
            <Action.CopyToClipboard title="Copy to Clipboard" content={json} />
            <Action.Paste title="Paste to Active App" content={json} />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}
