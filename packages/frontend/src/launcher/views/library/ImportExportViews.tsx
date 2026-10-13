import { useMemo, useState } from "react";
import type { ImageLike } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { native } from "../../../bridge/native";
import { Action, ActionPanel, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { launchCommand } from "../../launch";
import { exportFileName, pickJsonFile, saveTextFile } from "./files";
import { TransferPage } from "./TransferPage";
import { countLabel, ImportFormatError, normalizeImport, type TransferKind } from "./transfer";

const NOUN: Record<TransferKind, { title: string; search: string; searchTitle: string; fileTitle: string }> = {
  snippets: { title: "Snippets", search: "builtin:snippets.searchSnippets", searchTitle: "Search Snippets", fileTitle: "Snippets" },
  quicklinks: { title: "Quicklinks", search: "builtin:quicklinks.searchQuicklinks", searchTitle: "Search Quicklinks", fileTitle: "Quicklinks" },
};

type ImportState = { phase: "idle" } | { phase: "importing" } | { phase: "done"; imported: number; skipped: number } | { phase: "error"; message: string };

export interface ImportViewProps {
  kind: TransferKind;
  /** JSON documents handed over by a deeplink (`opencast://snippets/import?snippet=…`). */
  pending?: string[];
  title?: string;
  icon?: ImageLike;
}

/** Import Snippets / Import Quicklinks: pick a JSON file (or confirm deeplinked data) and report the result. */
export function ImportView({ kind, pending, title, icon }: ImportViewProps) {
  const noun = NOUN[kind];
  const [state, setState] = useState<ImportState>({ phase: "idle" });
  const [handover, setHandover] = useState(pending?.length ? pending : undefined);
  const pendingImport = useMemo(() => {
    if (!handover) return null;
    try {
      return normalizeImport(handover, kind);
    } catch {
      return null;
    }
  }, [handover, kind]);

  const run = async (documents: string | string[]) => {
    setState({ phase: "importing" });
    try {
      const { json } = normalizeImport(documents, kind);
      const result = await backend.call(kind === "snippets" ? "snippets.import" : "quicklinks.import", { json });
      setState({ phase: "done", imported: result.imported, skipped: result.skipped });
      setHandover(undefined);
      showToast({ style: result.imported ? "success" : "failure", title: result.imported ? "Import successful" : "Nothing imported", message: result.skipped ? `${countLabel(result.skipped, kind)} skipped` : undefined });
    } catch (error) {
      const message = error instanceof ImportFormatError ? error.message : errorMessage(error);
      setState({ phase: "error", message });
      showToast({ style: "failure", title: "Import failed", message });
    }
  };

  const selectFile = async () => {
    try {
      const file = await pickJsonFile(`Import ${noun.title}`);
      if (file) await run(file.text);
    } catch (error) {
      showToast({ style: "failure", title: "Could not open the file", message: errorMessage(error) });
    }
  };

  const goToSearch = () => void launchCommand(noun.search, { title: noun.searchTitle, icon, replace: true });

  const heading = pendingImport ? `Import ${countLabel(pendingImport.count, kind)}` : `Import ${noun.title}`;
  const lines: { text: string; tone?: "success" | "warning" }[] =
    state.phase === "done"
      ? [{ text: `✓ ${countLabel(state.imported, kind)} added`, tone: "success" }, ...(state.skipped ? [{ text: `⚠ ${countLabel(state.skipped, kind)} skipped (duplicates or invalid)`, tone: "warning" as const }] : [])]
      : state.phase === "error"
        ? [{ text: `⚠ ${state.message}`, tone: "warning" }]
        : handover && !pendingImport
          ? [{ text: "⚠ The shared data is not in the expected format", tone: "warning" }]
          : [{ text: pendingImport ? `Add them to your ${noun.title.toLowerCase()}?` : `Choose a JSON file exported from OpenCast or Raycast` }];

  const actions =
    state.phase === "done" ? (
      <ActionPanel>
        <Action title={`Go to ${noun.searchTitle}`} icon="magnifying-glass-16" onAction={goToSearch} />
        <Action title="Select Another File" icon="blank-document-16" onAction={selectFile} />
      </ActionPanel>
    ) : pendingImport ? (
      <ActionPanel>
        <Action title={heading} icon="download-16" onAction={() => run(handover!)} />
        <Action title="Select File Instead" icon="blank-document-16" onAction={selectFile} />
      </ActionPanel>
    ) : (
      <ActionPanel>
        <Action title="Select File" icon="blank-document-16" onAction={selectFile} />
      </ActionPanel>
    );

  return <TransferPage navigationTitle={title ?? `Import ${noun.title}`} navigationIcon={icon} icon={icon ?? "download-16"} title={heading} lines={lines} actions={actions} isLoading={state.phase === "importing"} />;
}

export interface ExportViewProps {
  kind: TransferKind;
  title?: string;
  icon?: ImageLike;
}

/** Export Snippets / Export Quicklinks as a JSON file Raycast and OpenCast can import. */
export function ExportView({ kind, title, icon }: ExportViewProps) {
  const noun = NOUN[kind];
  const navigation = useNavigation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const { json } = kind === "snippets" ? await backend.call("snippets.export") : await backend.call("quicklinks.export");
      const rows = kind === "snippets" ? await backend.call("snippets.list", {}) : await backend.call("quicklinks.list", {});
      const saved = await saveTextFile({ title: `Export ${noun.title}`, fileName: exportFileName(noun.fileTitle), text: json });
      if (!saved) return;
      navigation.popToRoot();
      showToast({
        title: `Exported ${noun.title.toLowerCase()}`,
        message: countLabel(rows.length, kind),
        primaryAction: saved === "downloaded" ? undefined : { title: "Show in Finder", shortcut: sc("cmd", "shift", "o"), onAction: () => native.call("open.showInFinder", { path: saved }) },
      });
    } catch (err) {
      setError(errorMessage(err));
      showToast({ style: "failure", title: `Failed to export ${noun.title.toLowerCase()}`, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <TransferPage
      navigationTitle={title ?? `Export ${noun.title}`}
      navigationIcon={icon}
      icon={icon ?? "upload-16"}
      title={`Export ${noun.title}`}
      lines={[error ? { text: `⚠ Export failed: ${error}`, tone: "warning" } : { text: "Choose a folder to save the export to" }]}
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action title="Export" icon="upload-16" onAction={exportAll} />
        </ActionPanel>
      }
    />
  );
}
