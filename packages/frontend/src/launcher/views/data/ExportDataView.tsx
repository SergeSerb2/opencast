import { useState } from "react";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { Action, ActionPanel, Form, showFailureToast, showHUD, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher } from "../../launch";
import type { LauncherViewProps } from "../registry";
import { EXPORT_CATEGORIES, exportCollections, exportFileName, homeFromDataDir, joinPath, MIN_PASSWORD_LENGTH, validateExportPassword } from "./data-format";

type ExportField = "destination" | "password" | "confirmation" | "categories";

const categoryField = (id: string) => `category.${id}`;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** "Export Data": every synced collection (or a selection) into one optionally encrypted file. */
export function ExportDataView({ title, icon }: LauncherViewProps) {
  const navigation = useNavigation();
  const { data: info, error: infoError } = useBackend("app.info", undefined);
  const [errors, setErrors] = useState<Partial<Record<ExportField, string>>>({});
  const [busy, setBusy] = useState(false);
  const clear = (field: ExportField) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  const home = info ? homeFromDataDir(info.dataDir) : undefined;
  const ready = info !== undefined || infoError !== undefined;

  const submit = async (values: Record<string, unknown>) => {
    if (busy) return;
    const directory = Array.isArray(values.destination) ? stringValue(values.destination[0]) : "";
    const password = stringValue(values.password);
    const selected = EXPORT_CATEGORIES.filter((c) => values[categoryField(c.id)] === true).map((c) => c.id);
    const found: Partial<Record<ExportField, string>> = { ...validateExportPassword(password, stringValue(values.confirmation)) };
    if (!directory) found.destination = "Choose a folder";
    if (!selected.length) found.categories = "Select at least one category";
    setErrors(found);
    const first = found.destination ?? found.password ?? found.confirmation ?? found.categories;
    if (first) {
      showToast({ style: "failure", title: first });
      return;
    }

    setBusy(true);
    const toast = showToast({ style: "animated", title: "Exporting data…" });
    try {
      const { path } = await backend.call("data.export", {
        path: joinPath(directory, exportFileName(new Date())),
        password: password || undefined,
        categories: selected.length === EXPORT_CATEGORIES.length ? undefined : exportCollections(selected),
      });
      const name = path.slice(path.lastIndexOf("/") + 1);
      toast.update({
        style: "success",
        title: "Exported Data",
        message: name,
        primaryAction: { title: "Show in Finder", shortcut: sc("cmd", "shift", "f"), onAction: () => native.call("open.showInFinder", { path }).then(hideLauncher) },
        secondaryAction: {
          title: "Copy Path",
          shortcut: sc("cmd", "shift", "c"),
          onAction: () =>
            native
              .call("clipboard.write", { content: { kind: "text", text: path } })
              .then(() => showHUD("Copied Path"))
              .catch((error: unknown) => showFailureToast("Failed to copy", error)),
        },
      });
      navigation.pop();
    } catch (error) {
      toast.update({ style: "failure", title: "Export failed", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form
      navigationTitle={title ?? "Export Data"}
      navigationIcon={icon}
      isLoading={busy || !ready}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Export Data" icon="upload-16" shortcut={sc("cmd", "return")} onSubmit={submit} />
        </ActionPanel>
      }
    >
      {ready && (
        <>
          <Form.Description text="Save your settings, snippets, notes, AI chats and more to one file you can import on another Mac." />
          <Form.FilePicker
            id="destination"
            title="Save To"
            canChooseDirectories
            canChooseFiles={false}
            allowMultipleSelection={false}
            defaultValue={home ? [`${home}/Downloads`] : []}
            error={errors.destination}
            onChange={() => clear("destination")}
          />
          <Form.PasswordField
            id="password"
            title="Password"
            placeholder="Optional"
            info={`Encrypts the export. Use at least ${MIN_PASSWORD_LENGTH} characters; you'll need the password to import the file.`}
            error={errors.password}
            onChange={() => clear("password")}
          />
          <Form.PasswordField id="confirmation" title="Confirm Password" placeholder="Repeat the password" error={errors.confirmation} onChange={() => clear("confirmation")} />
          <Form.Separator />
          {EXPORT_CATEGORIES.map((category, index) => (
            <Form.Checkbox
              key={category.id}
              id={categoryField(category.id)}
              title={index === 0 ? "Include" : undefined}
              label={category.title}
              info={category.id === "aiProviders" ? "Provider settings only. API keys stay in your Keychain and are never exported." : undefined}
              defaultValue
              error={index === 0 ? errors.categories : undefined}
              onChange={() => clear("categories")}
            />
          ))}
        </>
      )}
    </Form>
  );
}
