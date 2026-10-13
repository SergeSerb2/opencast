import { useState } from "react";
import { useBackend } from "../../bridge/hooks";
import { native } from "../../bridge/native";
import { useSetting } from "../../bridge/settings";
import { Button } from "../../components/Button/Button";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { formatBytes, tildePath } from "../lists";
import { saveSetting, SettingSelect, SettingSwitch } from "../ui/controls";
import { Controls, Row, Section } from "../ui/layout";
import { PageFrame } from "../ui/PageFrame";
import { chooseFiles } from "../ui/prompt";
import { PathListEditor } from "../ui/paths";
import { useSettingState } from "../ui/controls";
import { ExportDialog, ImportDialog } from "./DataDialogs";
import { BackupPassphraseRow } from "./BackupPassphrase";

const BACKUP_FREQUENCY = [
  { value: "never", title: "Never" },
  { value: "daily", title: "Daily" },
  { value: "weekly", title: "Weekly" },
  { value: "monthly", title: "Monthly" },
] as const;

const FAVICON_PROVIDERS = [
  { value: "google", title: "Google" },
  { value: "duckduckgo", title: "DuckDuckGo" },
  { value: "none", title: "None" },
] as const;

type ActiveDialog = { kind: "import"; path: string; format: "rayconfig" | "opencast" } | { kind: "export"; directory: string } | null;

async function pick(params: Parameters<typeof chooseFiles>[0]): Promise<string | null> {
  try {
    return (await chooseFiles(params))?.[0] ?? null;
  } catch (error) {
    showFailureToast("Could not open the file picker", error);
    return null;
  }
}

function StorageSection() {
  const { data: storage, error } = useBackend("data.storage", undefined);
  const { data: info } = useBackend("app.info", undefined);
  const openDataFolder = () => {
    if (info?.dataDir) native.call("open.path", { path: info.dataDir }).catch((err: unknown) => showFailureToast("Could not open the data folder", err));
  };
  return (
    <Section title="Storage" description="Everything OpenCast stores lives on this Mac until you turn on Cloud Sync.">
      <Row title="Database" description={storage ? `${Object.values(storage.entities).reduce((a, b) => a + b, 0)} items: notes, snippets, quicklinks, AI chats and more` : undefined}>
        <span className="sc-s-value">{storage ? formatBytes(storage.databaseBytes) : error ? "Unavailable" : "…"}</span>
      </Row>
      <Row title="Clipboard History" description={storage ? `${storage.clipboardItems} items` : undefined}>
        <span className="sc-s-value">{storage ? formatBytes(storage.clipboardBytes) : error ? "Unavailable" : "…"}</span>
      </Row>
      <Row title="Data Folder" description={info?.dataDir ? tildePath(info.dataDir) : undefined}>
        <Button size="small" onClick={openDataFolder} disabled={!info?.dataDir}>
          Show in Finder
        </Button>
      </Row>
    </Section>
  );
}

/** Settings → Advanced: import/export, backups, storage, connection. */
export function AdvancedPage() {
  const [dialog, setDialog] = useState<ActiveDialog>(null);
  const backupFrequency = useSetting("advanced.backupFrequency");
  const backupLocation = useSetting("advanced.backupLocation");
  const [certificates, setCertificates] = useSettingState("advanced.additionalCertificateAuthorities");

  const importFrom = async (format: "rayconfig" | "opencast") => {
    const path = await pick({
      canChooseFiles: true,
      canChooseDirectories: false,
      allowedTypes: format === "rayconfig" ? ["rayconfig"] : ["openconfig", "surgeconfig"],
      title: format === "rayconfig" ? "Choose a Raycast Export" : "Choose an OpenCast Export",
      prompt: "Import",
    });
    if (path) setDialog({ kind: "import", path, format });
  };
  const exportTo = async () => {
    const directory = await pick({ canChooseFiles: false, canChooseDirectories: true, title: "Choose Where to Save the Export", prompt: "Choose" });
    if (directory) setDialog({ kind: "export", directory });
  };
  const chooseBackupLocation = async () => {
    const directory = await pick({ canChooseFiles: false, canChooseDirectories: true, title: "Choose a Backup Folder", prompt: "Choose" });
    if (directory) void saveSetting("advanced.backupLocation", directory);
  };

  return (
    <PageFrame title="Advanced">
      <Section anchor="window-behavior">
        <Row title="Window Activation Behavior" description="Bring windows to your current Space or switch to the Space where they are open.">
          <SettingSelect setting="advanced.windowActivationBehavior" options={[{ value: "move-to-active-space", title: "Move to Active Space" }, { value: "switch-space", title: "Switch Space" }]} label="Window Activation Behavior" />
        </Row>
        <Row title="Tidy Menu Bar" description="Hide menu bar items to the left of the divider when you are not hovering over the menu bar.">
          <SettingSwitch setting="advanced.tidyMenuBar" label="Tidy Menu Bar" />
        </Row>
      </Section>
      <Section title="Import">
        <Row title="Import from Raycast" description="Bring snippets, quicklinks, notes, themes, AI commands and settings over from a Raycast export (.rayconfig).">
          <Button size="small" onClick={() => void importFrom("rayconfig")}>
            Import…
          </Button>
        </Row>
        <Row title="Import OpenCast Data" description="Restore an export made with OpenCast on this or another Mac.">
          <Button size="small" onClick={() => void importFrom("opencast")}>
            Import…
          </Button>
        </Row>
      </Section>
      <Section title="Export">
        <BackupPassphraseRow />
        <Row title="Export Data" description="Save your settings and content to a password-protected file.">
          <Button size="small" onClick={() => void exportTo()}>
            Export…
          </Button>
        </Row>
        <Row title="Scheduled Backup" description="Automatically export your settings and data on a schedule.">
          <SettingSelect setting="advanced.backupFrequency" options={BACKUP_FREQUENCY} label="Scheduled Backup" />
        </Row>
        <Row title="Backup Location" description={backupLocation ? tildePath(backupLocation) : "Choose a folder for scheduled backups."} disabled={backupFrequency === "never"}>
          <Controls>
            {backupLocation && (
              <Button size="small" variant="ghost" onClick={() => void saveSetting("advanced.backupLocation", null)}>
                Clear
              </Button>
            )}
            <Button size="small" onClick={() => void chooseBackupLocation()}>
              Choose…
            </Button>
          </Controls>
        </Row>
        <Row title="Auto-Delete" description="Automatically delete old backups to save disk space." disabled={backupFrequency === "never"}>
          <SettingSelect setting="advanced.backupAutoDelete" options={[{ value: "never", title: "Never" }, { value: 1, title: "Keep Latest" }, { value: 5, title: "Keep Last 5" }, { value: 10, title: "Keep Last 10" }]} label="Auto-Delete" disabled={backupFrequency === "never"} />
        </Row>
        <Row title="Skip on Battery" description="Run scheduled backups after this Mac returns to AC power." disabled={backupFrequency === "never"}>
          <SettingSwitch setting="advanced.backupSkipOnBattery" label="Skip on Battery" disabled={backupFrequency === "never"} />
        </Row>
      </Section>
      <StorageSection />
      <Section title="Connection">
        <Row title="Use System Proxy Settings" description="Use your Mac's proxy configuration for network connections.">
          <SettingSwitch setting="advanced.useSystemProxySettings" label="Use System Proxy Settings" />
        </Row>
        <Row title="Favicon Provider" description="The service used to fetch website icons for quicklinks and links, or None to turn favicon fetching off.">
          <SettingSelect setting="advanced.faviconProvider" options={FAVICON_PROVIDERS} label="Favicon Provider" />
        </Row>
        <Row title="Additional Certificate Authority" description="Choose certificate files (.crt, .cer, .pem) to trust for network connections." layout="stacked">
          <PathListEditor value={certificates} onAdd={(paths) => setCertificates([...new Set([...certificates, ...paths])])} onRemove={(path) => setCertificates(certificates.filter((p) => p !== path))} emptyTitle="No additional certificates" addTitle="Add Certificate…" canChooseFiles allowedTypes={["crt", "cer", "pem"]} />
        </Row>
      </Section>
      {dialog?.kind === "import" && <ImportDialog path={dialog.path} format={dialog.format} onClose={() => setDialog(null)} />}
      {dialog?.kind === "export" && (
        <ExportDialog
          directory={dialog.directory}
          onClose={() => setDialog(null)}
          onExported={(path) => {
            setDialog(null);
            showToast({ style: "success", title: "Data exported", message: tildePath(path) });
          }}
        />
      )}
    </PageFrame>
  );
}
