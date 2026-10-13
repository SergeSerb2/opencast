import { useState } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { getEnv } from "../../../bridge/env";
import { errorMessage } from "../../../bridge/errors";
import { Action, ActionPanel, Form, showToast, useNavigation } from "../../../components";
import { localFileUrl } from "../../../icons/image-source";
import { importErrors, importSource, type ImportErrors } from "./import-export";

export interface ImportAICommandsProps {
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  /** Runs after a successful import instead of going back (the view was opened directly). */
  onImported?: () => void;
}

/** Reads a picked file through the native host, which serves local files at surgecast-file://. */
async function readLocalFile(path: string): Promise<string> {
  if (!getEnv().native) throw new Error("Files can only be read in the Surgecast app. Paste the JSON instead.");
  let response: Response;
  try {
    response = await fetch(localFileUrl(path));
  } catch {
    throw new Error("Surgecast can't read this file. Choose a file in your home folder or paste the JSON.");
  }
  if (!response.ok) throw new Error(`Surgecast can't read this file (${response.status}).`);
  return response.text();
}

const plural = (count: number) => `${count} AI ${count === 1 ? "command" : "commands"}`;

/** Import AI commands exported from Surgecast or Raycast: a JSON file or pasted JSON. */
export function ImportAICommands({ navigationTitle, navigationIcon, onImported }: ImportAICommandsProps) {
  const navigation = useNavigation();
  const [errors, setErrors] = useState<ImportErrors>({});
  const [busy, setBusy] = useState(false);

  const submit = async (values: Record<string, unknown>) => {
    if (busy) return;
    const files = (values.file as string[] | undefined) ?? [];
    const pasted = String(values.json ?? "");
    const found = importErrors(files, pasted);
    setErrors(found);
    if (found.file || found.json) {
      showToast({ style: "failure", title: found.file ?? found.json ?? "Check the form" });
      return;
    }
    setBusy(true);
    const toast = showToast({ style: "animated", title: "Importing AI commands…" });
    try {
      const source = importSource(files, pasted);
      const json = source.kind === "file" ? await readLocalFile(source.path) : source.json;
      const { imported } = await backend.call("ai.commands.import", { json });
      toast.update({ style: "success", title: `Imported ${plural(imported)}` });
      if (onImported) onImported();
      else navigation.pop();
    } catch (error) {
      const message = errorMessage(error);
      setErrors(files.length ? { file: message } : { json: message });
      toast.update({ style: "failure", title: "Couldn't import AI commands", message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form
      navigationTitle={navigationTitle ?? "Import AI Commands"}
      navigationIcon={navigationIcon}
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Import AI Commands" icon="download-16" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Bring in AI commands exported from Surgecast or Raycast. Choose the exported JSON file, or paste its contents below." />
      <Form.FilePicker id="file" title="JSON File" allowMultipleSelection={false} canChooseDirectories={false} error={errors.file} onChange={() => setErrors((e) => ({ ...e, file: undefined }))} />
      <Form.TextArea
        id="json"
        title="Or Paste JSON"
        placeholder={'{ "commands": [ { "name": "…", "prompt": "…" } ] }'}
        info="Used when no file is chosen. Accepts a list of commands or an export with a commands array."
        error={errors.json}
        onChange={() => setErrors((e) => ({ ...e, json: undefined }))}
      />
    </Form>
  );
}
