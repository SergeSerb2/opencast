import { useState } from "react";
import type { ImageLike } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, Form, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { abbreviateHome } from "./script-list";

export interface AddScriptDirectoryViewProps {
  icon?: ImageLike;
  /** Called with the added folders after the form pops itself. */
  onAdded?: (paths: string[]) => void;
}

/** Adds folders to `scripts.directories`; the backend scans and watches them. */
export function AddScriptDirectoryView({ icon, onAdded }: AddScriptDirectoryViewProps) {
  const navigation = useNavigation();
  const directories = useSetting("scripts.directories");
  const [error, setError] = useState<string>();

  const submit = async (values: Record<string, unknown>) => {
    const paths = Array.isArray(values.directories) ? values.directories.filter((p): p is string => typeof p === "string") : [];
    if (!paths.length) {
      setError("Choose a folder");
      showToast({ style: "failure", title: "Choose a folder to add" });
      return;
    }
    const toast = showToast({ style: "animated", title: "Adding script directory…" });
    try {
      for (const path of paths) await backend.call("scripts.directories.add", { path });
      toast.update({ style: "success", title: paths.length === 1 ? "Added Script Directory" : `Added ${paths.length} Script Directories`, message: paths.length === 1 ? abbreviateHome(paths[0]) : undefined });
      navigation.pop();
      onAdded?.(paths);
    } catch (err) {
      toast.update({ style: "failure", title: "Could not add the directory", message: errorMessage(err) });
    }
  };

  return (
    <Form
      navigationTitle="Add Script Directory"
      navigationIcon={icon}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Directory" icon="new-folder-16" shortcut={sc("cmd", "return")} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Script commands in these folders show up in root search and Search Script Commands, and stay in sync as you edit the files." />
      <Form.FilePicker id="directories" title="Folders" canChooseDirectories canChooseFiles={false} allowMultipleSelection error={error} onChange={() => setError(undefined)} />
      {directories.map((directory, index) => (
        <Form.Description key={directory} title={index === 0 ? "Already Added" : undefined} text={abbreviateHome(directory)} />
      ))}
    </Form>
  );
}
