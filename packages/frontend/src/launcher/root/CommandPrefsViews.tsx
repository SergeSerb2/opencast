import { useState } from "react";
import type { Hotkey, RootSearchItem } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { native } from "../../bridge/native";
import { Action, ActionPanel, Button, Form, FormRow, Shortcut, showFailureToast, showToast, useNavigation } from "../../components";
import { sc } from "../../lib/keyboard";

/** Set or clear a command's alias (root search "Set Alias…"). */
export function SetAliasView({ item }: { item: RootSearchItem }) {
  const navigation = useNavigation();
  const [error, setError] = useState<string>();
  const save = async (values: Record<string, unknown>) => {
    const alias = String(values.alias ?? "").trim();
    if (alias.length > 32) {
      setError("Use at most 32 characters");
      return;
    }
    try {
      await backend.call("commands.setPrefs", { id: item.id, prefs: { alias: alias || undefined } });
      showToast({ style: "success", title: alias ? `Alias set to “${alias}”` : "Alias removed" });
      navigation.pop();
    } catch (err) {
      showFailureToast("Could not save the alias", err);
    }
  };
  return (
    <Form
      navigationTitle={`Set Alias for ${item.title}`}
      navigationIcon={item.icon}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Alias" icon="checkmark-16" onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.TextField id="alias" title="Alias" placeholder="e.g. cl" defaultValue={item.alias ?? ""} error={error} onChange={() => setError(undefined)} info="Type the alias in root search to find this command first." />
      <Form.Description text={item.title} title="Command" />
    </Form>
  );
}

/** Record or clear a global hotkey for a command (root search "Set Hotkey…"). */
export function SetHotkeyView({ item }: { item: RootSearchItem }) {
  const navigation = useNavigation();
  const [hotkey, setHotkey] = useState<Hotkey | undefined>(item.hotkey);
  const [recording, setRecording] = useState(false);

  const record = async () => {
    setRecording(true);
    try {
      const next = await native.call("hotkeys.record");
      if (next) setHotkey(next);
    } catch (error) {
      showFailureToast("Hotkey recording needs the Surgecast app", error);
    } finally {
      setRecording(false);
    }
  };
  const save = async (value: Hotkey | undefined) => {
    try {
      await backend.call("commands.setPrefs", { id: item.id, prefs: { hotkey: value } });
      showToast({ style: "success", title: value ? "Hotkey saved" : "Hotkey removed" });
      navigation.pop();
    } catch (error) {
      showFailureToast("Could not save the hotkey", error);
    }
  };

  return (
    <Form
      navigationTitle={`Set Hotkey for ${item.title}`}
      navigationIcon={item.icon}
      actions={
        <ActionPanel>
          <Action title="Save Hotkey" icon="checkmark-16" onAction={() => save(hotkey)} />
          <Action title="Record Hotkey" icon="keyboard-16" shortcut={sc("cmd", "r")} onAction={record} />
          {item.hotkey && <Action title="Remove Hotkey" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => save(undefined)} />}
        </ActionPanel>
      }
    >
      <FormRow title="Hotkey">
        <div className="sc-hotkey-field">
          {hotkey ? <Shortcut shortcut={{ modifiers: hotkey.modifiers, key: hotkey.key }} size="medium" variant="prominent" /> : <span className="sc-color-tertiary">No hotkey</span>}
          <Button size="small" variant="secondary" onClick={() => void record()} disabled={recording}>
            {recording ? "Recording…" : "Record Hotkey"}
          </Button>
        </div>
      </FormRow>
    </Form>
  );
}
