import type { ExtensionPreference } from "@surgecast/protocol";
import { applicationPreferenceValue } from "../../lib/application-preference";
import { backend } from "../../bridge/backend";
import { useBackend } from "../../bridge/hooks";
import { Button } from "../../components/Button/Button";
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { showFailureToast } from "../../components/feedback/toast-store";
import { tildePath } from "../lists";
import { settingId } from "../search";
import { useInstalledApps } from "./apps";
import { CommitTextField, Select } from "./controls";
import { Card, Row } from "./layout";
import { chooseFiles } from "./prompt";

export interface ExtensionPreferencesFormProps {
  extensionName: string;
  /** Command name for command-level preferences; omit for extension-level ones. */
  commandName?: string;
  preferences: readonly ExtensionPreference[];
  /** Render bare rows (inside an expanded command) instead of a card. */
  compact?: boolean;
}

function PreferenceControl({ preference, value, onChange }: { preference: ExtensionPreference; value: unknown; onChange: (value: unknown) => void }) {
  const apps = useInstalledApps(preference.type === "appPicker");
  const text = preference.type === "appPicker" ? applicationPreferenceValue(value) : typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  switch (preference.type) {
    case "checkbox":
      return <Checkbox checked={value === true} onChange={onChange} label={preference.label} />;
    case "dropdown":
      return (
        <Select
          value={text}
          options={(preference.data ?? []).map((item) => ({ value: item.value, title: item.title }))}
          onChange={onChange}
          placeholder="Select…"
          label={preference.title ?? preference.name}
        />
      );
    case "appPicker":
      if (apps.length)
        return (
          <Select
            value={text}
            options={apps.map((app) => ({ value: app.path, title: app.name, icon: { fileIcon: app.path } }))}
            onChange={onChange}
            placeholder="Choose Application…"
            searchable
            label={preference.title ?? preference.name}
          />
        );
      return <CommitTextField value={text} onCommit={onChange} placeholder={preference.placeholder ?? "/Applications/App.app"} width={220} label={preference.title ?? preference.name} />;
    case "file":
    case "directory": {
      const choose = async () => {
        try {
          const picked = await chooseFiles({ canChooseFiles: preference.type === "file", canChooseDirectories: preference.type === "directory", title: preference.title ?? preference.name });
          if (picked?.[0]) onChange(picked[0]);
        } catch (error) {
          showFailureToast("Could not open the file picker", error);
        }
      };
      return (
        <span className="sc-s-path-control">
          {text && (
            <span className="sc-s-value sc-truncate" title={text}>
              {tildePath(text)}
            </span>
          )}
          <Button size="small" onClick={() => void choose()}>
            {text ? "Change…" : "Choose…"}
          </Button>
        </span>
      );
    }
    case "password":
      return (
        <span className="sc-s-controls">
          <CommitTextField value="" onCommit={onChange} type="password" placeholder={text ? "Saved in Keychain — replace" : preference.placeholder ?? "Enter password"} width={200} label={preference.title ?? preference.name} />
          {text && <Button size="small" variant="ghost" onClick={() => onChange("")}>Remove</Button>}
        </span>
      );
    default:
      return (
        <CommitTextField
          value={text}
          onCommit={onChange}
          type="text"
          placeholder={preference.placeholder}
          width={220}
          label={preference.title ?? preference.name}
        />
      );
  }
}

/**
 * Rows for an extension's (or one command's) manifest preferences, read with
 * `extensions.getPreferences` and saved per change with `extensions.setPreferences`.
 * Password values are stored in the Keychain by the backend.
 */
export function ExtensionPreferencesForm({ extensionName, commandName, preferences, compact }: ExtensionPreferencesFormProps) {
  const params = commandName ? { name: extensionName, command: commandName } : { name: extensionName };
  const { data, refetch } = useBackend("extensions.getPreferences", params);
  const missing = new Set(data?.missingRequired ?? []);

  const save = async (name: string, value: unknown) => {
    try {
      await backend.call("extensions.setPreferences", { ...params, values: { [name]: value } });
      refetch();
    } catch (error) {
      showFailureToast("Could not save preference", error);
    }
  };

  const rows = preferences.map((preference) => (
    <Row
      key={preference.name}
      title={
        <>
          {preference.title ?? preference.name}
          {preference.required && <span className="sc-s-required"> *</span>}
        </>
      }
      anchor={settingId(preference.title ?? preference.name)}
      description={missing.has(preference.name) ? <span className="sc-s-missing">Required — commands won't run until this is set.</span> : preference.description}
    >
      <PreferenceControl preference={preference} value={data?.values[preference.name] ?? preference.default} onChange={(value) => void save(preference.name, value)} />
    </Row>
  ));
  return compact ? <div className="sc-s-preferences">{rows}</div> : <Card>{rows}</Card>;
}
