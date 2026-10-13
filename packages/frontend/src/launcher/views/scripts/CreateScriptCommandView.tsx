import { useEffect, useState } from "react";
import type { ScriptCommand } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { native } from "../../../bridge/native";
import { useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, Form, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher } from "../../launch";
import type { LauncherViewProps } from "../registry";
import { AddScriptDirectoryView } from "./AddScriptDirectoryView";
import { createScriptParams, MODE_HELP, REFRESH_INTERVALS, SCRIPT_LANGUAGES, SCRIPT_MODES, scriptDestination, scriptFileName, validateCreateScript, type CreateScriptErrors, type CreateScriptValues } from "./script-create";
import { abbreviateHome } from "./script-list";

const ADD_DIRECTORY = "__add-directory__";

const INITIAL: CreateScriptValues = { language: "bash", mode: "silent", title: "", packageName: "", icon: "", directory: "", needsConfirmation: false, refreshTime: "1m" };

/** "Create Script Command": writes a script from a template into one of the script directories. */
export function CreateScriptCommandView({ title, icon }: LauncherViewProps) {
  const navigation = useNavigation();
  const directories = useSetting("scripts.directories");
  const [values, setValues] = useState<CreateScriptValues>(INITIAL);
  const [errors, setErrors] = useState<CreateScriptErrors>({});
  const [busy, setBusy] = useState(false);

  // Default to the first directory once settings arrive (and after adding the first one).
  useEffect(() => {
    if (!values.directory && directories.length) setValues((v) => ({ ...v, directory: directories[0] }));
  }, [directories, values.directory]);

  const update = <K extends keyof CreateScriptValues>(key: K, value: CreateScriptValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const addDirectory = () => navigation.push(<AddScriptDirectoryView icon={icon} onAdded={(paths) => update("directory", paths[0])} />);

  const create = async (openAfterwards: boolean) => {
    if (busy) return;
    const found = validateCreateScript(values, directories);
    setErrors(found);
    if (Object.keys(found).length) {
      showToast({ style: "failure", title: found.title ?? found.directory ?? "Check the form" });
      return;
    }
    setBusy(true);
    const toast = showToast({ style: "animated", title: "Creating script command…" });
    try {
      const script: ScriptCommand = await backend.call("scripts.create", createScriptParams(values));
      const open = () => native.call("open.path", { path: script.path }).then(hideLauncher);
      const reveal = () => native.call("open.showInFinder", { path: script.path }).then(hideLauncher);
      navigation.pop();
      if (openAfterwards) {
        toast.update({ style: "success", title: "Created Script Command", message: abbreviateHome(script.path) });
        await open();
      } else {
        toast.update({
          style: "success",
          title: "Created Script Command",
          message: abbreviateHome(script.path),
          primaryAction: { title: "Open Script", shortcut: sc("cmd", "o"), onAction: open },
          secondaryAction: { title: "Show in Finder", shortcut: sc("cmd", "shift", "f"), onAction: reveal },
        });
      }
    } catch (error) {
      const message = errorMessage(error);
      if (/already exists|EEXIST/i.test(message)) setErrors((e) => ({ ...e, title: `${scriptFileName(values.title.trim(), values.language)} already exists` }));
      else if (/script directory/i.test(message)) setErrors((e) => ({ ...e, directory: "Choose one of your script directories" }));
      toast.update({ style: "failure", title: "Failed to create script command", message });
    } finally {
      setBusy(false);
    }
  };

  const destination = scriptDestination(values);
  return (
    <Form
      navigationTitle={title ?? "Create Script Command"}
      navigationIcon={icon}
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action title="Create Script Command" icon="plus-16" shortcut={sc("cmd", "return")} onAction={() => create(false)} />
          <Action title="Create and Open Script" icon="arrow-ne-16" shortcut={sc("cmd", "opt", "return")} onAction={() => create(true)} />
          <Action title="Add Script Directory…" icon="new-folder-16" shortcut={sc("cmd", "shift", "n")} onAction={addDirectory} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="language" title="Template" value={values.language} error={errors.language} onChange={(v) => update("language", v as CreateScriptValues["language"])}>
        {SCRIPT_LANGUAGES.map((language) => (
          <Form.Dropdown.Item key={language.value} value={language.value} title={language.title} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="mode" title="Mode" info={MODE_HELP} value={values.mode} error={errors.mode} onChange={(v) => update("mode", v as CreateScriptValues["mode"])}>
        {SCRIPT_MODES.map((mode) => (
          <Form.Dropdown.Item key={mode.value} value={mode.value} title={mode.title} />
        ))}
      </Form.Dropdown>
      {values.mode === "inline" ? (
        <Form.Dropdown id="refreshTime" title="Refresh" value={values.refreshTime} error={errors.refreshTime} onChange={(v) => update("refreshTime", v)}>
          {REFRESH_INTERVALS.map((interval) => <Form.Dropdown.Item key={interval.value} value={interval.value} title={interval.title} />)}
        </Form.Dropdown>
      ) : (
        <Form.Checkbox id="needsConfirmation" title="Confirmation" label="Ask before running" value={values.needsConfirmation} onChange={(v) => update("needsConfirmation", v)} />
      )}
      <Form.TextField id="title" title="Title" placeholder="Command Title" autoFocus value={values.title} error={errors.title} onChange={(v) => update("title", v)} />
      <Form.TextField id="packageName" title="Package Name" placeholder="E.g., Developer Utils" info="Groups related scripts in Search Script Commands and shows as the subtitle in root search." value={values.packageName} onChange={(v) => update("packageName", v)} />
      <Form.TextField id="icon" title="Icon" placeholder="Emoji, image path or URL" value={values.icon} onChange={(v) => update("icon", v)} />
      <Form.Dropdown
        id="directory"
        title="Directory"
        placeholder="No script directories"
        value={values.directory}
        error={errors.directory}
        onChange={(v) => (v === ADD_DIRECTORY ? addDirectory() : update("directory", v))}
      >
        <Form.Dropdown.Section>
          {directories.map((directory) => (
            <Form.Dropdown.Item key={directory} value={directory} title={abbreviateHome(directory)} icon="folder-16" />
          ))}
        </Form.Dropdown.Section>
        <Form.Dropdown.Section>
          <Form.Dropdown.Item value={ADD_DIRECTORY} title="Add Directory…" icon="plus-16" />
        </Form.Dropdown.Section>
      </Form.Dropdown>
      {destination && <Form.Description text={`Creates ${destination}`} />}
    </Form>
  );
}
