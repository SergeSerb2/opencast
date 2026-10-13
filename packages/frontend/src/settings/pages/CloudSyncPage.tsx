import { useEffect, useState, type ReactElement } from "react";
import { SYNC_CATEGORIES, type SyncDevice, type SyncStatus } from "@opencast/protocol";
import { backend } from "../../bridge/backend";
import { errorMessage } from "../../bridge/errors";
import { useBackend, useEvent } from "../../bridge/hooks";
import { useSetting } from "../../bridge/settings";
import { Button, IconButton } from "../../components/Button/Button";
import { Spinner } from "../../components/Spinner/Spinner";
import { Switch } from "../../components/Switch/Switch";
import { TextField } from "../../components/TextField/TextField";
import { confirmAlert } from "../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { Image } from "../../icons/Image";
import { openUrl } from "../actions";
import { CORE_PAGES } from "../catalog";
import { formatRelativeTime } from "../lists";
import { LINKS } from "../links";
import { validateSyncSetup, type SyncSetup } from "../sync-form";
import { SettingSelect } from "../ui/controls";
import { Callout, CardEmpty, Controls, Intro, Row, Section } from "../ui/layout";
import { PageFrame } from "../ui/PageFrame";
import { promptForm } from "../ui/prompt";
import "./cloud-sync.css";

const ICON = CORE_PAGES.find((p) => p.id === "cloud-sync")!.icon;

const PHASES: Record<SyncStatus["phase"], { label: string; tone: "success" | "warning" | "error" | "neutral" }> = {
  disabled: { label: "Off", tone: "neutral" },
  offline: { label: "Offline", tone: "warning" },
  connecting: { label: "Connecting…", tone: "neutral" },
  "initial-sync": { label: "Syncing…", tone: "neutral" },
  online: { label: "Up to Date", tone: "success" },
  error: { label: "Error", tone: "error" },
  "needs-passphrase": { label: "Passphrase Needed", tone: "warning" },
};

const INTERVALS = [
  { value: 60, title: "Every Minute" },
  { value: 300, title: "Every 5 Minutes" },
  { value: 900, title: "Every 15 Minutes" },
  { value: 3600, title: "Every Hour" },
];

const NOT_SYNCED = [
  { title: "Clipboard History", description: "Stays on the Mac where you copied it." },
  { title: "Script Files", description: "Script folders are per Mac; the scripts themselves stay on disk." },
  { title: "API Keys, Tokens & Passwords", description: "Kept in each Mac's Keychain. Add your provider keys on every Mac." },
  { title: "Extension Data", description: "Extensions sync as a list; their local storage and caches stay on each Mac." },
];

/** Live sync status: initial `sync.status` call, then `sync.status` events. */
function useSyncStatus() {
  const query = useBackend("sync.status", undefined, [], { refetchOn: [] });
  useEvent("sync.status", (status) => query.setData(status));
  return query;
}

function StatusBadge({ status }: { status: SyncStatus }) {
  const phase = PHASES[status.phase];
  const busy = status.phase === "connecting" || status.phase === "initial-sync";
  return (
    <span className="sc-s-sync-badge" data-tone={phase.tone}>
      {busy ? <Spinner size={12} /> : <span className="sc-s-sync-badge__dot" />}
      {phase.label}
    </span>
  );
}

function SetupForm({ status }: { status: SyncStatus }) {
  const savedUrl = useSetting("sync.serverUrl");
  const [form, setForm] = useState<SyncSetup>({ serverUrl: savedUrl ?? "", token: "", passphrase: "", confirmPassphrase: "", createVault: false, deviceName: status.deviceName });
  const [errors, setErrors] = useState<Partial<Record<keyof SyncSetup, string>>>({});
  const [connectError, setConnectError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm((f) => ({ ...f, deviceName: f.deviceName || status.deviceName })), [status.deviceName]);
  const update = (patch: Partial<SyncSetup>) => {
    setForm({ ...form, ...patch });
    setErrors({});
    setConnectError(null);
  };

  const connect = async () => {
    const problems = validateSyncSetup(form);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setConnectError(null);
    try {
      await backend.call("sync.connect", { serverUrl: form.serverUrl.trim(), token: form.token.trim(), passphrase: form.passphrase, deviceName: form.deviceName.trim() || undefined });
      showToast({ style: "success", title: "Cloud Sync is on" });
    } catch (error) {
      setConnectError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof SyncSetup, title: string, input: ReactElement, description?: string) => (
    <Row title={title} description={errors[key] ? <span className="sc-s-missing">{errors[key]}</span> : description} align="center">
      <span className="sc-s-sync-field">{input}</span>
    </Row>
  );

  return (
    <Section title="Connect to Your Server" description="Use the URL and access token printed by the deploy script.">
      {field(
        "serverUrl",
        "Server URL",
        <TextField
          size="small"
          value={form.serverUrl}
          onChange={(serverUrl) => update({ serverUrl })}
          placeholder="https://sync.example.workers.dev"
          validation={errors.serverUrl ? "error" : undefined}
        />,
      )}
      {field(
        "token",
        "Access Token",
        <TextField size="small" type="password" value={form.token} onChange={(token) => update({ token })} placeholder="Paste token" validation={errors.token ? "error" : undefined} />,
      )}
      <Row title="Create a New Vault" description="Turn on for your first Mac. Leave off to join the vault your other Macs already use.">
        <Switch checked={form.createVault} onChange={(createVault) => update({ createVault })} label="Create a New Vault" />
      </Row>
      {field(
        "passphrase",
        "Encryption Passphrase",
        <TextField
          size="small"
          type="password"
          value={form.passphrase}
          onChange={(passphrase) => update({ passphrase })}
          placeholder={form.createVault ? "At least 12 characters" : "Your vault passphrase"}
          validation={errors.passphrase ? "error" : undefined}
        />,
        form.createVault ? "Encrypts everything before it leaves this Mac. Store it in a password manager — it can't be recovered." : undefined,
      )}
      {form.createVault &&
        field(
          "confirmPassphrase",
          "Confirm Passphrase",
          <TextField
            size="small"
            type="password"
            value={form.confirmPassphrase}
            onChange={(confirmPassphrase) => update({ confirmPassphrase })}
            placeholder="Repeat passphrase"
            validation={errors.confirmPassphrase ? "error" : undefined}
          />,
        )}
      {field(
        "deviceName",
        "Device Name",
        <TextField size="small" value={form.deviceName} onChange={(deviceName) => update({ deviceName })} placeholder="MacBook Pro" />,
        "Visible to the server and your other Macs.",
      )}
      <div className="sc-s-item sc-s-sync-connect">
        {connectError && (
          <span className="sc-s-missing sc-s-sync-connect__error" role="alert">
            {connectError}
          </span>
        )}
        <Button size="small" onClick={() => void connect()} disabled={busy}>
          {busy ? "Connecting…" : form.createVault ? "Create Vault & Connect" : "Connect"}
        </Button>
      </div>
    </Section>
  );
}

function SelfHostingInfo() {
  return (
    <Section title="How It Works" card={false}>
      <Callout tone="info" icon="lock-16" title="End-to-end encrypted">
        OpenCast encrypts your data on this Mac with a key derived from your passphrase. The server stores only ciphertext and can't read your notes, snippets, chats or settings. Your passphrase is
        never stored or sent.
      </Callout>
      <Callout
        tone="info"
        icon="cloud-16"
        title="Your own server"
        actions={
          <>
            <Button size="small" variant="ghost" onClick={() => openUrl(LINKS.syncWorker)}>
              Worker README
            </Button>
            <Button size="small" onClick={() => openUrl(LINKS.syncGuide)}>
              Setup Guide
            </Button>
            <Button size="small" variant="ghost" onClick={() => openUrl(LINKS.syncDeploy)}>Deploy Script</Button>
          </>
        }
      >
        Sync runs on a Cloudflare Worker with a D1 database in your Cloudflare account. Run <code>./scripts/deploy-sync.sh</code> after <code>wrangler login</code>; it prints the server URL and access
        token to paste here.
      </Callout>
    </Section>
  );
}

function SyncedContent({ status, editable }: { status: SyncStatus; editable: boolean }) {
  const disabled = useSetting("sync.disabledCategories");
  const toggle = async (category: string, enabled: boolean) => {
    try {
      await backend.call("sync.setCategoryEnabled", { category, enabled });
    } catch (error) {
      showFailureToast("Could not change synced content", error);
    }
  };
  return (
    <Section
      title="Synced Content"
      description={editable ? "Turning a category off keeps its data on this Mac and stops syncing it." : "Everything below syncs once you connect. You can turn categories off later."}
    >
      {SYNC_CATEGORIES.map((category) => {
        const count = status.counts[category.id];
        return (
          <Row key={category.id} title={category.title} anchor={`sync-${category.id}`}>
            {count !== undefined && <span className="sc-s-value">{count.toLocaleString()}</span>}
            {editable && <Switch checked={!disabled.includes(category.id)} onChange={(enabled) => void toggle(category.id, enabled)} label={`Sync ${category.title}`} />}
          </Row>
        );
      })}
      <Row title="Always Synced" description="Settings, aliases, hotkeys, favorites, themes and translator commands." />
    </Section>
  );
}

function DeviceRow({ device }: { device: SyncDevice }) {
  const remove = async () => {
    const confirmed = await confirmAlert({
      title: `Remove “${device.name}”?`,
      message: "It stops syncing immediately. Its local data stays on that Mac, and it can reconnect with the token and passphrase.",
      primaryAction: { title: "Remove Device", style: "destructive" },
    });
    if (!confirmed) return;
    try {
      await backend.call("sync.removeDevice", { deviceId: device.deviceId });
    } catch (error) {
      showFailureToast("Could not remove device", error);
    }
  };
  return (
    <div className="sc-s-item sc-s-row" data-align="center">
      <Image source="desktop-16" size={20} />
      <div className="sc-s-row__label">
        <div className="sc-s-row__title">
          {device.name}
          {device.current && (
            <span className="sc-s-badge" data-tone="accent">
              This Mac
            </span>
          )}
        </div>
        <div className="sc-s-description">
          {[device.platform, device.appVersion && `OpenCast ${device.appVersion}`, device.lastSeenAt && `Last seen ${formatRelativeTime(device.lastSeenAt).toLowerCase()}`]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {!device.current && <IconButton icon="minus-circle-16" label={`Remove ${device.name}`} onClick={() => void remove()} />}
    </div>
  );
}

function SyncedDevices() {
  const { data: devices, error, isLoading } = useBackend("sync.devices", undefined);
  return (
    <Section title="Synced Devices">
      {devices?.length ? (
        devices.map((device) => <DeviceRow key={device.deviceId} device={device} />)
      ) : (
        <CardEmpty title={error ? "Couldn't Load Devices" : isLoading ? "Loading Devices…" : "No Synced Devices"} description={error ? errorMessage(error) : undefined} />
      )}
    </Section>
  );
}

async function disconnect() {
  const confirmed = await confirmAlert({
    title: "Disconnect This Mac?",
    message: "Syncing stops on this Mac. Your data stays here and on the server, and the access token and vault key are removed from the Keychain.",
    primaryAction: { title: "Disconnect", style: "destructive" },
  });
  if (!confirmed) return;
  try {
    await backend.call("sync.disconnect", { forgetKeys: true });
  } catch (error) {
    showFailureToast("Could not disconnect", error);
  }
}

async function wipeRemote() {
  const values = await promptForm({
    title: "Delete Cloud Sync Data & Devices",
    message: "This permanently deletes the encrypted vault, every synced record and every device from your server. Data on your Macs is kept. Type “wipe” to confirm.",
    fields: [{ id: "confirm", label: "Confirmation", placeholder: "wipe", required: true }],
    primaryTitle: "Delete Everything",
    validate: ({ confirm }) => (confirm.trim().toLowerCase() === "wipe" ? null : { confirm: "Type “wipe” to confirm" }),
  });
  if (!values) return;
  try {
    await backend.call("sync.wipeRemote", { confirm: "wipe" });
    showToast({ style: "success", title: "Cloud Sync data deleted" });
  } catch (error) {
    showFailureToast("Could not delete Cloud Sync data", error);
  }
}

async function unlock(serverUrl: string | undefined, deviceName: string) {
  if (!serverUrl) return;
  const values = await promptForm({
    title: "Unlock Cloud Sync",
    message: "The vault on your server changed or this Mac lost its key. Enter the access token and passphrase to reconnect.",
    fields: [
      { id: "token", label: "Access Token", type: "password", required: true },
      { id: "passphrase", label: "Encryption Passphrase", type: "password", required: true },
    ],
    primaryTitle: "Unlock",
  });
  if (!values) return;
  try {
    await backend.call("sync.connect", { serverUrl, token: values.token.trim(), passphrase: values.passphrase, deviceName });
  } catch (error) {
    showFailureToast("Could not unlock Cloud Sync", error);
  }
}

function ConnectedView({ status }: { status: SyncStatus }) {
  const [syncing, setSyncing] = useState(false);
  const syncNow = async () => {
    setSyncing(true);
    try {
      await backend.call("sync.now");
    } catch (error) {
      showFailureToast("Sync failed", error);
    } finally {
      setSyncing(false);
    }
  };
  const detail =
    status.phase === "online" && status.pendingChanges > 0
      ? `${status.pendingChanges} change${status.pendingChanges === 1 ? "" : "s"} waiting to upload`
      : status.lastSyncedAt
        ? `Last synced ${formatRelativeTime(status.lastSyncedAt).toLowerCase()}`
        : "Not synced yet";
  return (
    <>
      <Section anchor="cloud-sync">
        <Row title="Cloud Sync" description="Keep settings and content in sync across your Macs.">
          <Switch checked onChange={() => void disconnect()} label="Cloud Sync" />
        </Row>
        <Row title="Status" description={detail} anchor="sync-now">
          <Controls>
            <StatusBadge status={status} />
            <Button size="small" onClick={() => void syncNow()} disabled={syncing || status.phase === "connecting" || status.phase === "initial-sync"}>
              Sync Now
            </Button>
          </Controls>
        </Row>
        <Row title="Server" description={status.serverUrl} />
        <Row title="Sync Every" description="Changes also sync a few seconds after you make them.">
          <SettingSelect setting="sync.intervalSeconds" options={INTERVALS} label="Sync Every" />
        </Row>
      </Section>
      {status.phase === "error" && status.lastError && (
        <Callout
          tone="error"
          title="Sync failed"
          actions={
            <Button size="small" onClick={() => void syncNow()}>
              Try Again
            </Button>
          }
        >
          {status.lastError}
        </Callout>
      )}
      {status.phase === "needs-passphrase" && (
        <Callout
          tone="warning"
          title="Passphrase needed"
          actions={
            <Button size="small" onClick={() => void unlock(status.serverUrl, status.deviceName)}>
              Unlock…
            </Button>
          }
        >
          Sync is paused until you enter the vault passphrase again.
        </Callout>
      )}
      <SyncedContent status={status} editable />
      <SyncedDevices />
    </>
  );
}

/** Settings → Cloud Sync: self-hosted, end-to-end encrypted sync (setup or status). */
export function CloudSyncPage() {
  const { data: status, error } = useSyncStatus();
  const connected = status && status.phase !== "disabled";
  return (
    <PageFrame title="Cloud Sync">
      <Intro icon={ICON} title="Cloud Sync" description="Sync settings, notes, snippets, quicklinks, AI chats and more across your Macs — end-to-end encrypted, through a server you run yourself." />
      {!status ? (
        <div className="sc-s-card">
          <CardEmpty title={error ? "Cloud Sync Unavailable" : "Loading…"} description={error ? errorMessage(error) : undefined} />
        </div>
      ) : connected ? (
        <ConnectedView status={status} />
      ) : (
        <>
          <SetupForm status={status} />
          <SelfHostingInfo />
          <SyncedContent status={status} editable={false} />
        </>
      )}
      <Section title="Not Synced">
        {NOT_SYNCED.map((item) => (
          <Row key={item.title} title={item.title} description={item.description} />
        ))}
      </Section>
      {connected && (
        <Section title="Danger Zone">
          <Row title="Disconnect This Mac" description="Stop syncing here. Local and server data are kept.">
            <Button size="small" onClick={() => void disconnect()}>
              Disconnect…
            </Button>
          </Row>
          <Row title="Delete Cloud Sync Data & Devices" description="Permanently delete the vault and all synced data from your server.">
            <Button size="small" variant="destructive" onClick={() => void wipeRemote()}>
              Delete…
            </Button>
          </Row>
        </Section>
      )}
    </PageFrame>
  );
}
