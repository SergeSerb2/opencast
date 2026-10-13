import { backend } from "../../bridge/backend";
import { useBackend } from "../../bridge/hooks";
import { Button } from "../../components/Button/Button";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { Controls, Row } from "../ui/layout";
import { promptForm } from "../ui/prompt";

/** The scheduled export key is stored through the backend's Keychain service, never settings. */
export function BackupPassphraseRow() {
  const { data: saved, error, refetch } = useBackend("data.backup.hasPassphrase", undefined);
  const setPassphrase = async (passphrase: string | null) => {
    try {
      await backend.call("data.backup.setPassphrase", { passphrase });
      refetch();
      showToast({ style: "success", title: passphrase ? "Export passphrase saved in Keychain" : "Export passphrase removed" });
    } catch (error) { showFailureToast("Could not save export passphrase", error); }
  };
  const edit = async () => {
    const values = await promptForm({
      title: "Export Passphrase",
      message: "Protect scheduled exports with a passphrase. Keep a copy in a password manager so you can restore your backups.",
      fields: [
        { id: "passphrase", label: "Passphrase", type: "password", required: true },
        { id: "confirm", label: "Confirm Passphrase", type: "password", required: true },
      ],
      primaryTitle: "Save",
      validate: ({ passphrase, confirm }): Record<string, string> | null => passphrase.length < 8 ? { passphrase: "Use at least 8 characters" } : passphrase !== confirm ? { confirm: "Passphrases don't match" } : null,
    });
    if (values) await setPassphrase(values.passphrase);
  };
  return (
    <Row title="Export Passphrase" description={error ? "This backend cannot configure scheduled export passphrases." : "Encrypt scheduled backups. The passphrase stays in this Mac's Keychain."}>
      <Controls>
        {saved && <span className="sc-s-badge" data-tone="success">Saved in Keychain</span>}
        <Button size="small" onClick={() => void edit()} disabled={Boolean(error)}>{saved ? "Replace…" : "Set…"}</Button>
        {saved && <Button size="small" variant="ghost" onClick={() => void setPassphrase(null)}>Remove</Button>}
      </Controls>
    </Row>
  );
}
