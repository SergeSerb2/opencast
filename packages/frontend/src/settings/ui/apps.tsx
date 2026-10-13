import { useEffect, useState } from "react";
import type { AppInfo } from "@opencast/protocol";
import { native } from "../../bridge/native";
import { Button, IconButton } from "../../components/Button/Button";
import { Image } from "../../icons/Image";
import { CardEmpty } from "./layout";
import { MenuButton } from "./MenuButton";
import { promptForm } from "./prompt";
import "./apps.css";

let appsPromise: Promise<AppInfo[]> | null = null;

/** Installed applications from the native host (empty in a plain browser). Loaded once per window. */
export function useInstalledApps(enabled = true): AppInfo[] {
  const [apps, setApps] = useState<AppInfo[]>([]);
  useEffect(() => {
    if (!enabled || !native.available) return;
    appsPromise ??= native.call("apps.list", {}).catch(() => []);
    let active = true;
    void appsPromise.then((list) => active && setApps([...list].sort((a, b) => a.name.localeCompare(b.name))));
    return () => {
      active = false;
    };
  }, [enabled]);
  return apps;
}

const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** Friendly names for common bundle ids when the app list isn't available. */
const KNOWN_APPS: Record<string, string> = {
  "com.1password.1password": "1Password",
  "com.agilebits.onepassword7": "1Password 7",
  "com.bitwarden.desktop": "Bitwarden",
  "com.apple.keychainaccess": "Keychain Access",
  "com.apple.Passwords": "Passwords",
};

export interface AppListEditorProps {
  /** Bundle identifiers. */
  value: readonly string[];
  onChange: (value: string[]) => void;
  emptyTitle: string;
  emptyDescription?: string;
}

/** A card list of applications (by bundle id) with Add/Remove, for "Disabled Applications" rows. */
export function AppListEditor({ value, onChange, emptyTitle, emptyDescription }: AppListEditorProps) {
  const apps = useInstalledApps();
  const byBundle = new Map(apps.filter((a) => a.bundleId).map((a) => [a.bundleId as string, a]));
  const candidates = apps.filter((a) => a.bundleId && !value.includes(a.bundleId));

  const addByIdentifier = async () => {
    const result = await promptForm({
      title: "Add Application",
      message: "Enter the app's bundle identifier. You can find it with: osascript -e 'id of app \"App Name\"'",
      fields: [{ id: "bundleId", label: "Bundle Identifier", placeholder: "com.example.App", required: true }],
      primaryTitle: "Add",
      validate: ({ bundleId }) => (BUNDLE_ID.test(bundleId.trim()) ? null : { bundleId: "Use reverse-DNS form, e.g. com.example.App" }),
    });
    if (result && !value.includes(result.bundleId.trim())) onChange([...value, result.bundleId.trim()]);
  };

  return (
    <div className="sc-s-applist">
      {value.length ? (
        value.map((bundleId) => {
          const app = byBundle.get(bundleId);
          return (
            <div key={bundleId} className="sc-s-applist__item">
              <Image source={app ? { fileIcon: app.path } : "app-window-16"} size={20} />
              <span className="sc-s-applist__name sc-truncate">{app?.name ?? KNOWN_APPS[bundleId] ?? bundleId}</span>
              <span className="sc-s-applist__id sc-truncate">{bundleId}</span>
              <IconButton icon="minus-circle-16" label={`Remove ${app?.name ?? bundleId}`} onClick={() => onChange(value.filter((id) => id !== bundleId))} />
            </div>
          );
        })
      ) : (
        <CardEmpty title={emptyTitle} description={emptyDescription} />
      )}
      <div className="sc-s-applist__footer">
        {candidates.length ? (
          <MenuButton
            sections={[{ items: candidates.map((app) => ({ id: app.bundleId as string, title: app.name, icon: { fileIcon: app.path }, keywords: [app.bundleId as string] })) }]}
            onSelect={(item) => onChange([...value, item.id])}
            searchable
            align="start"
            width={280}
            icon="plus-16"
          >
            Add Application…
          </MenuButton>
        ) : (
          <Button size="small" icon="plus-16" onClick={() => void addByIdentifier()}>
            Add Application…
          </Button>
        )}
      </div>
    </div>
  );
}
