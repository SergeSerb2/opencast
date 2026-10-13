import { useState } from "react";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { Action, ActionPanel, Form, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import type { LauncherViewProps } from "../registry";
import { formatCount, importErrorField, importSummary, RAYCONFIG_CATEGORIES, RAYCONFIG_EXTENSION, SURGECAST_EXTENSION, type ImportField } from "./data-format";
import { ImportResultsView } from "./ImportResultsView";

export interface ImportDataProps {
  format?: "rayconfig" | "surgecast";
  /** Preselected file (e.g. opened from Finder or a deeplink's launch context). */
  path?: string;
}

const categoryField = (id: string) => `category.${id}`;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** "Import Raycast Data" (`.rayconfig`) and "Import Surgecast Data": file, password, categories → results. */
export function ImportDataView({ props, title, icon }: LauncherViewProps<ImportDataProps>) {
  const navigation = useNavigation();
  const rayconfig = props.format !== "surgecast";
  const [errors, setErrors] = useState<Partial<Record<ImportField, string>>>({});
  const [busy, setBusy] = useState(false);
  const clear = (field: ImportField) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  const submit = async (values: Record<string, unknown>) => {
    const file = Array.isArray(values.file) ? stringValue(values.file[0]) : "";
    const password = stringValue(values.password) || undefined;
    const categories = rayconfig ? RAYCONFIG_CATEGORIES.filter((c) => values[categoryField(c.id)] === true).map((c) => c.id) : undefined;
    const found: Partial<Record<ImportField, string>> = {};
    if (!file) found.file = "Choose a file to import";
    if (categories && !categories.length) found.categories = "Select at least one category";
    setErrors(found);
    const first = found.file ?? found.categories;
    if (first) {
      showToast({ style: "failure", title: first });
      return;
    }

    setBusy(true);
    const toast = showToast({ style: "animated", title: "Importing data…" });
    try {
      const { results } = rayconfig ? await backend.call("data.importRayconfig", { path: file, password, categories }) : await backend.call("data.import", { path: file, password });
      const summary = importSummary(results);
      const imported = `Imported ${formatCount(summary.imported, "item")}`;
      if (summary.failed) toast.update({ style: "failure", title: imported, message: `${formatCount(summary.failed, "category", "categories")} could not be imported` });
      else toast.update({ style: "success", title: imported });
      navigation.push(<ImportResultsView results={results} title={title} icon={icon} />);
    } catch (error) {
      const message = errorMessage(error);
      const mapped = importErrorField(message);
      if (mapped) setErrors({ [mapped.field]: mapped.error });
      toast.update({ style: "failure", title: "Import failed", message: mapped?.message ?? message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form
      navigationTitle={title ?? (rayconfig ? "Import Raycast Data" : "Import Surgecast Data")}
      navigationIcon={icon}
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Import Data" icon="download-16" shortcut={sc("cmd", "return")} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description
        text={
          rayconfig
            ? "Move your snippets, quicklinks, notes, AI commands, themes and settings over from Raycast."
            : "Restore everything from a Surgecast export, for example one made on another Mac."
        }
      />
      <Form.FilePicker
        id="file"
        title={rayconfig ? "Raycast Export" : "Surgecast Export"}
        info={rayconfig ? "In Raycast, run Export Settings & Data to create a .rayconfig file." : "Create one with Export Data."}
        allowMultipleSelection={false}
        allowedTypes={[rayconfig ? RAYCONFIG_EXTENSION : SURGECAST_EXTENSION]}
        defaultValue={props.path ? [props.path] : []}
        error={errors.file}
        onChange={() => clear("file")}
      />
      <Form.PasswordField
        id="password"
        title="Password"
        placeholder={rayconfig ? "Password used for the export" : "Only if the export is encrypted"}
        info={rayconfig ? "Raycast encrypts exports with the password you chose when exporting." : undefined}
        error={errors.password}
        onChange={() => clear("password")}
      />
      {rayconfig && <Form.Separator />}
      {rayconfig &&
        RAYCONFIG_CATEGORIES.map((category, index) => (
          <Form.Checkbox
            key={category.id}
            id={categoryField(category.id)}
            title={index === 0 ? "Import" : undefined}
            info={index === 0 ? "Imported items replace existing ones with the same ID." : undefined}
            label={category.title}
            defaultValue
            error={index === 0 ? errors.categories : undefined}
            onChange={() => clear("categories")}
          />
        ))}
    </Form>
  );
}
