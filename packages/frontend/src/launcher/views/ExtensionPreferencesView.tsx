import { useEffect, useMemo, useState } from "react";
import type { ExtensionPreference } from "@surgecast/protocol";
import { applicationPreferenceValue } from "../../lib/application-preference";
import { backend } from "../../bridge/backend";
import { useBackend } from "../../bridge/hooks";
import { native } from "../../bridge/native";
import { Action, ActionPanel, Form, showFailureToast, showToast, useNavigation } from "../../components";
import { launchCommand } from "../launch";
import type { LauncherViewProps } from "./registry";

export interface ExtensionPreferencesProps {
  extensionName?: string;
  name?: string;
  command?: string;
  missingRequired?: string[];
  commandName?: string;
  /** Relaunch this command after saving (onboarding for commands with required preferences). */
  launchCommandId?: string;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

/** Preferences form generated from an extension's (and command's) preference manifest. */
export function ExtensionPreferencesView({ props, title, icon }: LauncherViewProps<ExtensionPreferencesProps>) {
  const navigation = useNavigation();
  const extensionName = props.extensionName ?? props.name ?? "";
  const commandName = props.commandName ?? props.command;
  const launchCommandId = props.launchCommandId ?? (props.missingRequired?.length && commandName ? `ext:${extensionName}.${commandName}` : undefined);
  const { data: extensions, isLoading: loadingManifest } = useBackend("extensions.list", undefined);
  const { data: stored, isLoading: loadingValues } = useBackend("extensions.getPreferences", { name: extensionName, command: commandName });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [installedApps, setInstalledApps] = useState<{ title: string; value: string }[] | null>(null);

  const extension = extensions?.find((e) => e.name === extensionName);
  const definitions = useMemo<ExtensionPreference[]>(() => {
    if (!extension) return [];
    const command = commandName ? extension.commands.find((c) => c.name === commandName) : undefined;
    return [...extension.preferences, ...(command?.preferences ?? [])];
  }, [extension, commandName]);

  const needsApps = definitions.some((d) => d.type === "appPicker");
  useEffect(() => {
    if (!needsApps) return;
    native
      .call("apps.list", {})
      .then((list) => setInstalledApps(list.map((a) => ({ title: a.name, value: a.path }))))
      .catch(() => setInstalledApps([]));
  }, [needsApps]);

  const submit = async (values: Record<string, unknown>) => {
    const missing = Object.fromEntries(definitions.filter((d) => d.required && isEmpty(values[d.name])).map((d) => [d.name, "Required"]));
    setErrors(missing);
    if (Object.keys(missing).length) {
      showToast({ style: "failure", title: "Fill in the required preferences" });
      return;
    }
    try {
      const normalized = Object.fromEntries(definitions.map((d) => [d.name, d.type === "file" || d.type === "directory" ? ((values[d.name] as string[] | undefined)?.[0] ?? "") : values[d.name]]));
      await backend.call("extensions.setPreferences", { name: extensionName, command: commandName, values: normalized });
      if (launchCommandId) await launchCommand(launchCommandId, { replace: true, title, icon });
      else {
        showToast({ style: "success", title: "Preferences saved" });
        navigation.pop();
      }
    } catch (error) {
      showFailureToast("Could not save preferences", error);
    }
  };

  const loading = loadingManifest || loadingValues || (needsApps && installedApps === null);
  const values = stored?.values ?? {};
  const ready = Boolean(extension && stored);
  return (
    <Form
      navigationTitle={title ?? `${extension?.title ?? extensionName} Preferences`}
      navigationIcon={icon}
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={launchCommandId ? "Save and Continue" : "Save Preferences"} icon="checkmark-16" onSubmit={submit} />
        </ActionPanel>
      }
    >
      {ready && launchCommandId && <Form.Description text={`${extension?.title ?? extensionName} needs a few settings before it can run.`} />}
      {ready &&
        definitions.map((def) => {
          const label = def.title ?? def.name;
          const error = errors[def.name];
          const initial = values[def.name] ?? def.default;
          switch (def.type) {
            case "password":
              return <Form.PasswordField key={def.name} id={def.name} title={label} info={def.description} placeholder={def.placeholder} defaultValue={String(initial ?? "")} error={error} />;
            case "checkbox":
              return <Form.Checkbox key={def.name} id={def.name} title={label} label={def.label ?? def.description} defaultValue={Boolean(initial)} error={error} />;
            case "dropdown":
              return (
                <Form.Dropdown key={def.name} id={def.name} title={label} info={def.description} defaultValue={initial === undefined ? undefined : String(initial)} error={error}>
                  {(def.data ?? []).map((option) => (
                    <Form.Dropdown.Item key={option.value} value={option.value} title={option.title} />
                  ))}
                </Form.Dropdown>
              );
            case "appPicker":
              return (
                <Form.Dropdown key={def.name} id={def.name} title={label} info={def.description} defaultValue={applicationPreferenceValue(initial)} error={error}>
                  {(installedApps ?? []).map((option) => (
                    <Form.Dropdown.Item key={option.value} value={option.value} title={option.title} icon={{ fileIcon: option.value }} />
                  ))}
                </Form.Dropdown>
              );
            case "file":
            case "directory":
              return (
                <Form.FilePicker
                  key={def.name}
                  id={def.name}
                  title={label}
                  info={def.description}
                  allowMultipleSelection={false}
                  canChooseDirectories={def.type === "directory"}
                  canChooseFiles={def.type === "file"}
                  defaultValue={typeof initial === "string" && initial ? [initial] : []}
                  error={error}
                />
              );
            default:
              return <Form.TextField key={def.name} id={def.name} title={label} info={def.description} placeholder={def.placeholder} defaultValue={initial === undefined ? "" : String(initial)} error={error} />;
          }
        })}
    </Form>
  );
}
