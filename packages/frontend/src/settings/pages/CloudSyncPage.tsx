import { cloneElement, useEffect, useState, type ClipboardEvent, type ReactElement, type ReactNode } from "react";
import { SYNC_CATEGORIES, type BackendResult, type SyncDevice, type SyncStatus } from "@opencast/protocol";
import { native } from "../../bridge/native";
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
import { passphraseStrength, validateSyncCredentials, validateSyncSetup, type SyncSetup } from "../sync-form";
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
  { title: "Extension Passwords & Sign-ins", description: "Kept in each Mac's Keychain." },
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
  const [form, setForm] = useState<SyncSetup>({ serverUrl: savedUrl ?? status.serverUrl ?? "", token: "", passphrase: "", confirmPassphrase: "", deviceName: status.deviceName });
  const [setupCode, setSetupCode] = useState("");
  const [probe, setProbe] = useState<BackendResult<"sync.probe"> | null>(null);
  const [syncKeys, setSyncKeys] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<keyof SyncSetup, string>>>({});
  const [connectError, setConnectError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mode = probe?.vault === "absent" ? "create" : "join";
  const strength = passphraseStrength(form.passphrase);
  useEffect(() => setForm((f) => ({ ...f, deviceName: f.deviceName || status.deviceName, serverUrl: f.serverUrl || savedUrl || status.serverUrl || "" })), [savedUrl, status.deviceName, status.serverUrl]);
  const update = (patch: Partial<SyncSetup>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors({});
    setConnectError(null);
  };

  const inspect = async (pastedCode?: string) => {
    if (busy) return;
    setBusy(true);
    setConnectError(null);
    setErrors({});
    try {
      let credentials = { serverUrl: form.serverUrl.trim(), token: form.token.trim() };
      const code = pastedCode ?? (setupCode.trim() || (credentials.serverUrl.startsWith("opencast-sync-v1:") ? credentials.serverUrl : ""));
      if (code) {
        credentials = await backend.call("sync.parseSetupCode", { code });
        setSetupCode(code.trim());
        update(credentials);
      }
      const problems = validateSyncCredentials(credentials);
      setErrors(problems);
      if (Object.keys(problems).length) return;
      const result = await backend.call("sync.probe", credentials);
      update(credentials);
      setProbe(result);
    } catch (error) {
      setConnectError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const pasteCode = (event: ClipboardEvent<HTMLInputElement>, codeField = false) => {
    const code = event.clipboardData.getData("text").trim();
    if (!codeField && !code.startsWith("opencast-sync-v1:")) return;
    event.preventDefault();
    setSetupCode(code);
    void inspect(code);
  };
  const connect = async () => {
    const problems = validateSyncSetup(form, mode);
    setErrors(problems);
    if (Object.keys(problems).length || busy) return;
    setBusy(true);
    setConnectError(null);
    try {
      await backend.call("sync.setCategoryEnabled", { category: "ai-keys", enabled: syncKeys });
      await backend.call("sync.connect", { serverUrl: form.serverUrl.trim(), token: form.token.trim(), passphrase: form.passphrase, deviceName: form.deviceName.trim() || undefined, expectVault: mode });
      showToast({ style: "success", title: "Cloud Sync is on" });
    } catch (error) {
      setConnectError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof SyncSetup, title: string, input: ReactElement<{ "aria-label"?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>, description?: ReactNode) => {
    const detail = errors[key] || description;
    const descriptionId = `sync-${key}-description`;
    return (
      <Row title={title} description={detail ? <span id={descriptionId} className={errors[key] ? "sc-s-missing" : undefined} role={errors[key] ? "alert" : undefined}>{detail}</span> : undefined} align="center">
        <span className="sc-s-sync-field">{cloneElement(input, { "aria-label": title, "aria-invalid": Boolean(errors[key]), "aria-describedby": detail ? descriptionId : undefined })}</span>
      </Row>
    );
  };

  return (
    <>
      {!probe && <SelfHostingInfo onToken={(token) => { setSetupCode(""); update({ token }); }} />}
      <Section title={!probe ? "Connect to Your Server" : mode === "create" ? "Create your vault" : "Join your vault"}
        description={!probe ? <>Step 1 of 2 · Check your server. Enter your <span data-setting-id="encryption-passphrase">passphrase</span> and <span data-setting-id="device-name">device name</span> in the next step.</> : `Step 2 of 2 · ${new URL(form.serverUrl).host}`}>
        {!probe ? (
          <>
            <Row title="Paste setup code" description="From your other Mac or the deploy script.">
              <span className="sc-s-sync-field"><TextField size="small" type="password" aria-label="Paste setup code" value={setupCode} onChange={(code) => { setSetupCode(code); setConnectError(null); }} onPaste={(event) => pasteCode(event, true)} placeholder="opencast-sync-v1:…" disabled={busy} /></span>
            </Row>
            {field("serverUrl", "Server URL", <TextField size="small" value={form.serverUrl} onChange={(serverUrl) => { setSetupCode(""); update({ serverUrl }); }} onPaste={(event) => pasteCode(event)} placeholder="https://sync.example.workers.dev" validation={errors.serverUrl ? "error" : undefined} disabled={busy} />)}
            {field("token", "Access Token", <TextField size="small" type="password" value={form.token} onChange={(token) => { setSetupCode(""); update({ token }); }} placeholder="Paste token" validation={errors.token ? "error" : undefined} disabled={busy} />)}
          </>
        ) : (
          <>
            {probe.deviceRevoked && <div className="sc-s-item sc-s-description">This Mac was removed. Connect to register it again.</div>}
            {field("passphrase", "Encryption Passphrase", <TextField size="small" type="password" value={form.passphrase} onChange={(passphrase) => update({ passphrase })} placeholder={mode === "create" ? "At least 12 characters" : "Your vault passphrase"} validation={errors.passphrase ? "error" : undefined} disabled={busy} />,
              mode === "create" ? "Store it in a password manager. It can't be recovered." : "Enter the same passphrase you used on your other Mac.")}
            {mode === "create" && (
              <>
                <div className="sc-s-item sc-s-sync-strength" role="status" aria-label={`Passphrase strength: ${strength.label}`}>
                  <span className="sc-s-sync-strength__meter" data-score={strength.score} aria-hidden="true">{[1, 2, 3].map(segment => <span key={segment} data-filled={segment <= strength.score} />)}</span>
                  <span className="sc-s-description">{strength.label}. Use four or more random words. If your token leaks, this passphrase is the only protection left.</span>
                </div>
                {field("confirmPassphrase", "Confirm Passphrase", <TextField size="small" type="password" value={form.confirmPassphrase} onChange={(confirmPassphrase) => update({ confirmPassphrase })} placeholder="Repeat passphrase" validation={errors.confirmPassphrase ? "error" : undefined} disabled={busy} />)}
              </>
            )}
            {field("deviceName", "Device Name", <TextField size="small" value={form.deviceName} onChange={(deviceName) => update({ deviceName })} placeholder="MacBook Pro" disabled={busy} />, "Visible to the server and your other Macs.")}
            <Row title="Also sync AI & MCP keys" description="Provider API keys, secret headers, MCP secrets and web-search keys are encrypted with your passphrase before they leave this Mac.">
              <Switch checked={syncKeys} onChange={setSyncKeys} label="Also sync AI & MCP keys" disabled={busy} />
            </Row>
          </>
        )}
        <div className="sc-s-item sc-s-sync-connect">
          {connectError && <span className="sc-s-missing sc-s-sync-connect__error" role="alert">{connectError}</span>}
          {probe && <Button size="small" variant="ghost" disabled={busy} onClick={() => { setProbe(null); update({ passphrase: "", confirmPassphrase: "" }); }}>Back</Button>}
          <Button size="small" onClick={() => void (probe ? connect() : inspect())} disabled={busy}>
            {busy ? probe ? "Connecting…" : "Checking…" : !probe ? "Continue" : mode === "create" ? "Create Vault & Connect" : "Connect"}
          </Button>
        </div>
      </Section>
    </>
  );
}

async function copySecret(text: string) {
  await native.call("clipboard.write", { content: { kind: "text", text }, concealed: true, transient: true });
}

function SelfHostingInfo({ onToken }: { onToken: (token: string) => void }) {
  const [token, setToken] = useState("");
  const generate = () => {
    const value = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    setToken(value);
    onToken(value);
  };
  const copy = async () => {
    try { await copySecret(token); showToast({ style: "success", title: "Access token copied" }); }
    catch (error) { showFailureToast("Could not copy token", error); }
  };
  return (
    <Section title="Set up your server" description="Your data is encrypted on this Mac. Your passphrase never leaves it.">
      <Row title="Deploy Your Worker" description="Use your own Cloudflare account.">
        <Button size="small" onClick={() => openUrl(LINKS.syncCloudflareDeploy)}>Deploy to Cloudflare</Button>
      </Row>
      <Row title="Create an Access Token" description="Paste this as SYNC_TOKEN when Cloudflare asks. Then paste your Worker URL below.">
        <Button size="small" onClick={generate}>Generate Access Token</Button>
      </Row>
      {token && <Row title="Generated Token"><span className="sc-s-sync-field"><TextField size="small" aria-label="Generated Access Token" value={token} onChange={() => {}} readOnly accessory={<Button size="small" variant="ghost" onClick={() => void copy()}>Copy</Button>} /></span></Row>}
      <Row title="Prefer the Terminal?">
        <Button size="small" variant="ghost" onClick={() => openUrl(LINKS.syncDeployGuide)}>Deploy Script Guide</Button>
      </Row>
    </Section>
  );
}

function AddAnotherMac() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const getCode = async (copy: boolean) => {
    setBusy(true);
    try {
      const result = await backend.call("sync.setupCode");
      if (copy) { await copySecret(result.code); showToast({ style: "success", title: "Setup code copied" }); }
      else setCode(result.code);
    } catch (error) { showFailureToast("Could not get setup code", error); }
    finally { setBusy(false); }
  };
  return (
    <Section title="Add Another Mac" description="Send this only to your own Macs, for example with AirDrop or your password manager. It contains your server access token, not your passphrase.">
      <Row title="Setup Code" description="Paste it in Cloud Sync on your other Mac, then enter your vault passphrase.">
        <Controls>
          <Button size="small" variant="ghost" onClick={() => code ? setCode("") : void getCode(false)} disabled={busy}>{code ? "Hide Code" : "Show Code"}</Button>
          <Button size="small" onClick={() => void getCode(true)} disabled={busy}>Copy Setup Code</Button>
        </Controls>
      </Row>
      {code && <Row title="Your Setup Code"><span className="sc-s-sync-field"><TextField size="small" aria-label="Your Setup Code" value={code} onChange={() => {}} readOnly /></span></Row>}
    </Section>
  );
}

function SyncedContent({ status, editable }: { status: SyncStatus; editable: boolean }) {
  const disabled = useSetting("sync.disabledCategories");
  const optedIn = useSetting("sync.optInCategories");
  const toggle = async (category: string, enabled: boolean) => {
    if (category === "ai-keys" && enabled && !optedIn.includes(category)) {
      const confirmed = await confirmAlert({
        title: "Sync API keys in your encrypted vault?",
        message: "Your provider keys, secret headers, MCP secrets and web-search keys will be encrypted with your vault passphrase and stored on your server as ciphertext. Anyone with your passphrase or an unlocked Mac can read them. Extension passwords and sign-ins never sync.",
        primaryAction: { title: "Sync Keys" },
      });
      if (!confirmed) return;
    }
    try {
      await backend.call("sync.setCategoryEnabled", { category, enabled });
    } catch (error) {
      showFailureToast("Could not change synced content", error);
    }
  };
  return (
    <Section
      title="Synced Content"
      description={editable ? "Turning a category off keeps its data on this Mac and stops syncing it." : "Choose whether to include AI & MCP keys when you connect. You can change categories later."}
    >
      {SYNC_CATEGORIES.map((category) => {
        const count = status.counts[category.id];
        return (
          <Row key={category.id} title={category.title} anchor={`sync-${category.id}`} description={category.id === "ai-keys" ? "Turning this off keeps keys on this Mac and stops syncing them. Works best with AI Commands & Presets and MCP Servers on." : undefined}>
            {count !== undefined && <span className="sc-s-value">{count.toLocaleString()}</span>}
            {editable && (
              <Switch
                checked={"optIn" in category ? optedIn.includes(category.id) : !disabled.includes(category.id)}
                onChange={(enabled) => void toggle(category.id, enabled)}
                label={`Sync ${category.title}`}
              />
            )}
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
    await backend.call("sync.connect", { serverUrl, token: values.token.trim(), passphrase: values.passphrase, deviceName, expectVault: "join" });
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
      {status.phase !== "needs-passphrase" && <AddAnotherMac />}
      <SyncedContent status={status} editable />
      <SyncedDevices />
    </>
  );
}

/** Settings → Cloud Sync: self-hosted, end-to-end encrypted sync (setup or status). */
export function CloudSyncPage() {
  const { data: status, error } = useSyncStatus();
  const enabled = useSetting("sync.enabled");
  const connected = status && enabled && !status.stopReason;
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
          {status.stopReason && <Callout tone="warning" title={status.stopReason === "device-removed" ? "This Mac was removed" : "Your cloud vault changed"}>
            {status.stopReason === "device-removed" ? "This Mac stopped syncing because it was removed from your server. Enter the vault passphrase to reconnect." : "This Mac stopped syncing because the vault was removed or replaced. Enter the current vault passphrase to reconnect. Your local data is kept."}
          </Callout>}
          <SetupForm status={status} />
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
