import type { InstalledExtension } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { useBackend } from "../../bridge/hooks";
import { Switch } from "../../components/Switch/Switch";
import { confirmAlert } from "../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { showInFinder } from "../actions";
import { EXTENSION_FALLBACK_ICON } from "../catalog";
import { useAllCommands } from "../data";
import { navigate } from "../navigation";
import { CommandsCard } from "../ui/commands";
import { ExtensionPreferencesForm } from "../ui/ExtensionPreferences";
import { CardEmpty, Controls, Intro, Row, Section } from "../ui/layout";
import { MenuButton } from "../ui/MenuButton";
import { PageFrame } from "../ui/PageFrame";

const SOURCE_LABEL: Record<InstalledExtension["source"], string> = { store: "Store", local: "Local", development: "Development" };

async function setExtensionEnabled(extension: InstalledExtension, enabled: boolean) {
  try {
    await backend.call("extensions.setEnabled", { name: extension.name, enabled });
  } catch (error) {
    showFailureToast(enabled ? "Could not enable extension" : "Could not disable extension", error);
  }
}

async function checkForUpdate(extension: InstalledExtension) {
  const toast = showToast({ style: "animated", title: "Checking for updates…" });
  try {
    const { updated } = await backend.call("extensions.update", { name: extension.name });
    toast.update(updated.length ? { style: "success", title: `Updated ${extension.title}` } : { style: "success", title: `${extension.title} is up to date` });
  } catch (error) {
    toast.update({ style: "failure", title: "Could not update extension", message: error instanceof Error ? error.message : undefined });
  }
}

async function uninstall(extension: InstalledExtension) {
  const confirmed = await confirmAlert({
    title: `Uninstall ${extension.title}?`,
    message: "Its commands, preferences and stored data are removed from this Mac.",
    primaryAction: { title: "Uninstall", style: "destructive" },
  });
  if (!confirmed) return;
  try {
    await backend.call("extensions.uninstall", { name: extension.name });
    navigate("shortcuts");
    showToast({ style: "success", title: `Uninstalled ${extension.title}` });
  } catch (error) {
    showFailureToast("Could not uninstall extension", error);
  }
}

/** Settings page of one installed extension (§8.6, §13.7). */
export function ExtensionPage({ name }: { name: string }) {
  const { data: extensions, isLoading } = useBackend("extensions.list", undefined);
  const { data: commands } = useAllCommands();
  const extension = extensions?.find((e) => e.name === name);

  if (!extension) {
    return (
      <PageFrame title="Extension" titleMode="always">
        <div className="sc-s-card">
          <CardEmpty title={isLoading ? "Loading…" : "Extension Not Installed"} description={isLoading ? undefined : `No installed extension is named “${name}”.`} />
        </div>
      </PageFrame>
    );
  }

  const own = (commands ?? []).filter((c) => c.id.startsWith(`ext:${extension.name}.`)).sort((a, b) => a.title.localeCompare(b.title));
  const menu = [
    ...(extension.source === "store" ? [{ id: "update", title: "Check for Updates", icon: "arrow-clockwise-16" }] : []),
    ...(extension.path ? [{ id: "finder", title: "Show in Finder", icon: "finder-16" }] : []),
    { id: "uninstall", title: "Uninstall…", icon: "trash-16", style: "destructive" as const },
  ];
  const actions = (
    <Controls>
      <Switch checked={extension.enabled} onChange={(enabled) => void setExtensionEnabled(extension, enabled)} label={`Enable ${extension.title}`} />
      <MenuButton
        icon="ellipsis-16"
        label="Extension Actions"
        width={220}
        sections={[{ items: menu }]}
        onSelect={(item) => {
          if (item.id === "update") void checkForUpdate(extension);
          if (item.id === "finder" && extension.path) showInFinder(extension.path);
          if (item.id === "uninstall") void uninstall(extension);
        }}
      />
    </Controls>
  );

  return (
    <PageFrame title={extension.title} actions={actions}>
      <Intro icon={extension.icon ?? EXTENSION_FALLBACK_ICON} title={extension.title} description={extension.description}>
        <span className="sc-s-intro-meta">
          {[`by ${extension.owner ?? extension.author}`, extension.version && `Version ${extension.version}`, SOURCE_LABEL[extension.source]].filter(Boolean).join(" · ")}
        </span>
      </Intro>
      <div className="sc-s-extension-body" data-disabled={!extension.enabled || undefined}>
        {extension.preferences.length > 0 && (
          <Section title="Preferences" card={false}>
            <ExtensionPreferencesForm extensionName={extension.name} preferences={extension.preferences} />
          </Section>
        )}
        <Section title="Commands" card={false}>
          {own.length ? (
            <CommandsCard
              commands={own}
              allCommands={commands ?? []}
              extensionName={extension.name}
              manifestPreferences={(command) => extension.commands.find((c) => command.id === `ext:${extension.name}.${c.name}`)?.preferences}
            />
          ) : (
            <div className="sc-s-card">
              <CardEmpty title="No Commands" description="This extension doesn't add any commands." />
            </div>
          )}
        </Section>
        {extension.tools.length > 0 && (
          <Section title="AI Tools" description="AI can call these tools when you mention the extension in a chat.">
            {extension.tools.map((tool) => (
              <Row key={tool.name} title={tool.title} description={tool.description} />
            ))}
          </Section>
        )}
      </div>
    </PageFrame>
  );
}
