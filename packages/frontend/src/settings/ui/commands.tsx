import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CommandInfo, ExtensionPreference } from "@surgecast/protocol";
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { Icon } from "../../icons/Icon";
import { Image } from "../../icons/Image";
import { setCommandHotkey, updateCommand, useHotkeyConflict } from "../data";
import { settingId } from "../search";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { ExtensionPreferencesForm } from "./ExtensionPreferences";
import "./commands.css";

/** Inline alias editor (§8.4): 24px, "Add Alias" placeholder, saves on Enter/blur. */
export function AliasInput({ command }: { command: CommandInfo }) {
  const [draft, setDraft] = useState(command.alias ?? "");
  const cancelled = useRef(false);
  useEffect(() => setDraft(command.alias ?? ""), [command.alias]);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const alias = draft.trim();
    if (alias === (command.alias ?? "")) return setDraft(alias);
    void updateCommand(command.id, alias ? { alias } : {}, alias ? undefined : ["alias"]).then((updated) => {
      if (!updated) setDraft(command.alias ?? "");
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelled.current = true;
      setDraft(command.alias ?? "");
      event.currentTarget.blur();
    }
  };
  return (
    <input
      className="sc-s-alias"
      value={draft}
      placeholder="Add Alias"
      spellCheck={false}
      aria-label={`Alias for ${command.title}`}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

export function CommandHotkey({ command, commands }: { command: CommandInfo; commands: readonly CommandInfo[] }) {
  const conflict = useHotkeyConflict(command.id, commands);
  return <HotkeyRecorder value={command.hotkey} onChange={(hotkey) => setCommandHotkey(command.id, hotkey)} conflict={conflict} label={`Hotkey for ${command.title}`} />;
}

/** "Command", "Menu Bar", "No View" etc. for the Shortcuts type column. */
export function commandTypeLabel(command: CommandInfo): string {
  if (command.kind !== "builtin" && command.kind !== "extension") return command.typeLabel;
  if (command.mode === "menu-bar") return "Menu Bar";
  return command.typeLabel || "Command";
}

/** Disclosure chevron that rotates −90° when collapsed (§8.6). */
export function Disclosure({ open, duration = 100 }: { open: boolean; duration?: number }) {
  return <Icon name="chevron-down-small-16" size={16} className="sc-s-disclosure" style={{ transform: open ? undefined : "rotate(-90deg)", transitionDuration: `${duration}ms` }} />;
}

interface CommandDetailProps {
  command: CommandInfo;
  /** Extension name and command manifest when the command comes from an installed extension. */
  extensionName?: string;
  preferences?: ExtensionPreference[];
  footer?: ReactNode;
}

/** Expanded area below a command row: description and command preferences (24px leading inset). */
export function CommandDetail({ command, extensionName, preferences, footer }: CommandDetailProps) {
  return (
    <div className="sc-s-command-detail">
      {command.description && <p className="sc-s-command-detail__description">{command.description}</p>}
      {extensionName && preferences?.length ? (
        <ExtensionPreferencesForm extensionName={extensionName} commandName={command.id.slice(`ext:${extensionName}.`.length)} preferences={preferences} compact />
      ) : null}
      {!command.description && !preferences?.length && !footer && <p className="sc-s-command-detail__description">This command has no preferences.</p>}
      {footer}
    </div>
  );
}

export interface CommandsCardProps {
  commands: readonly CommandInfo[];
  /** All commands, for hotkey conflict checks. */
  allCommands: readonly CommandInfo[];
  extensionName?: string;
  manifestPreferences?: (command: CommandInfo) => ExtensionPreference[] | undefined;
  disabled?: boolean;
}

/**
 * Commands grid on an extension page (§8.6): Name 1fr / Alias 110 / Hotkey 140 /
 * Enabled 24, rows ≥46px; a row expands to show its preferences.
 */
export function CommandsCard({ commands, allCommands, extensionName, manifestPreferences, disabled }: CommandsCardProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="sc-s-card sc-s-commands" data-disabled={disabled || undefined}>
      <div className="sc-s-commands__header" aria-hidden="true">
        <span>Name</span>
        <span>Alias</span>
        <span>Hotkey</span>
        <span />
      </div>
      {commands.map((command) => {
        const open = expanded === command.id;
        const preferences = manifestPreferences?.(command);
        return (
          <div key={command.id} className="sc-s-item sc-s-commands__group" data-setting-id={settingId(command.title)}>
            <div className="sc-s-commands__row" data-enabled={command.enabled || undefined}>
              <button type="button" className="sc-s-commands__name" aria-expanded={open} onClick={() => setExpanded(open ? null : command.id)}>
                <Image source={command.icon} size={16} />
                <span className="sc-truncate">{command.title}</span>
                {command.needsPreferences && (
                  <span className="sc-s-badge" data-tone="warning">
                    Needs Setup
                  </span>
                )}
                <Disclosure open={open} />
              </button>
              <span className="sc-s-commands__alias">
                <AliasInput command={command} />
              </span>
              <CommandHotkey command={command} commands={allCommands} />
              <Checkbox checked={command.enabled} onChange={(enabled) => void updateCommand(command.id, { enabled })} aria-label={`Enable ${command.title}`} id={`enabled-${command.id}`} />
            </div>
            {open && <CommandDetail command={command} extensionName={extensionName} preferences={preferences} />}
          </div>
        );
      })}
    </div>
  );
}
