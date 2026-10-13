import { useState } from "react";
import type { CommandInfo } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { Button, IconButton } from "../../components/Button/Button";
import { confirmAlert } from "../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { Icon } from "../../icons/Icon";
import { Image } from "../../icons/Image";
import { useAllCommands } from "../data";
import { moveItem } from "../lists";
import { SettingSelect, SettingSwitch, useSettingState } from "../ui/controls";
import { CardEmpty, Row, Section } from "../ui/layout";
import { MenuButton } from "../ui/MenuButton";
import { PageFrame } from "../ui/PageFrame";
import "./launcher.css";

const SCREENS = [
  { value: "mouse-screen", title: "Screen containing mouse" },
  { value: "active-window-screen", title: "Screen with active window" },
  { value: "primary-screen", title: "Primary screen" },
] as const;

const POP_TO_ROOT = [{ value: 0, title: "Immediately" }, ...[5, 15, 30, 60, 90, 120, 180].map((seconds) => ({ value: seconds, title: `After ${seconds} seconds` })), { value: -1, title: "Never" }];

const SENSITIVITY = [
  { value: "low", title: "Low" },
  { value: "medium", title: "Medium" },
  { value: "high", title: "High" },
] as const;

async function resetRanking() {
  const confirmed = await confirmAlert({
    title: "Reset Ranking?",
    message: "Root search forgets how often you used each command and ranks results by their names until it learns again.",
    primaryAction: { title: "Reset Ranking", style: "destructive" },
  });
  if (!confirmed) return;
  try {
    await backend.call("commands.resetRanking", {});
    showToast({ style: "success", title: "Ranking reset" });
  } catch (error) {
    showFailureToast("Could not reset ranking", error);
  }
}

function FallbackRow({
  command,
  index,
  count,
  onMove,
  onRemove,
  dragging,
  onDragStart,
  onDragEnd,
  onDropAt,
}: {
  command: CommandInfo;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropAt: (index: number) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className="sc-s-item sc-s-fallback"
      data-dragging={dragging || undefined}
      data-over={over || undefined}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", command.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onDropAt(index);
      }}
    >
      <Icon name="ellipsis-vertical-16" size={16} className="sc-s-fallback__handle" />
      <Image source={command.icon} size={16} />
      <span className="sc-s-fallback__title sc-truncate">{command.title}</span>
      <span className="sc-s-fallback__meta sc-truncate">{command.extensionTitle ?? command.subtitle ?? command.typeLabel}</span>
      <span className="sc-s-fallback__actions">
        <IconButton icon="arrow-up-16" label="Move Up" disabled={index === 0} onClick={() => onMove(index, index - 1)} />
        <IconButton icon="arrow-down-16" label="Move Down" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} />
        <IconButton icon="minus-circle-16" label="Remove" onClick={onRemove} />
      </span>
    </div>
  );
}

function FallbackCommands() {
  const [ids, setIds] = useSettingState("launcher.fallbackCommands");
  const { data: commands } = useAllCommands();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const byId = new Map((commands ?? []).map((c) => [c.id, c]));
  const entries = ids.map((id) => byId.get(id)).filter((c): c is CommandInfo => Boolean(c));
  const candidates = (commands ?? []).filter((c) => c.acceptsFallbackText && c.enabled && !ids.includes(c.id));

  return (
    <Section
      title="Fallback Commands"
      description="Offered under root search when you type text that doesn't match anything. Drag to reorder; the first one runs when you press ↵."
      actions={
        <MenuButton
          sections={[{ items: candidates.map((c) => ({ id: c.id, title: c.title, icon: c.icon, accessoryText: c.extensionTitle ?? c.subtitle })) }]}
          onSelect={(item) => setIds([...ids, item.id])}
          disabled={!candidates.length}
          emptyText="No more commands accept text"
          width={300}
        >
          Add Fallback
        </MenuButton>
      }
    >
      {entries.length ? (
        entries.map((command, index) => (
          <FallbackRow
            key={command.id}
            command={command}
            index={index}
            count={entries.length}
            onMove={(from, to) => setIds(moveItem(entries, from, to).map((c) => c.id))}
            onRemove={() => setIds(ids.filter((id) => id !== command.id))}
            dragging={dragIndex === index}
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => setDragIndex(null)}
            onDropAt={(to) => {
              if (dragIndex !== null) setIds(moveItem(entries, dragIndex, to).map((c) => c.id));
              setDragIndex(null);
            }}
          />
        ))
      ) : (
        <CardEmpty title="No Fallback Commands" description="Add commands such as Quick AI or Search Files to run them with the text you typed." />
      )}
    </Section>
  );
}

/** Settings → Launcher. */
export function LauncherPage() {
  return (
    <PageFrame title="Launcher">
      <Section anchor="behavior">
        <Row title="Show Surgecast on">
          <SettingSelect setting="launcher.windowPresentationMode" options={SCREENS} label="Show Surgecast on" />
        </Row>
        <Row title="Pop to Root Search" description="Time after closing the window when Surgecast returns to root search.">
          <SettingSelect setting="launcher.popToRootTimeout" options={POP_TO_ROOT} label="Pop to Root Search" />
        </Row>
        <Row
          title="Root Search Sensitivity"
          description="How many results root search shows for a query. Low sensitivity shows more loosely matching results; high sensitivity shows fewer, closer matches."
        >
          <SettingSelect setting="launcher.rootSearchSensitivity" options={SENSITIVITY} label="Root Search Sensitivity" />
        </Row>
        <Row title="Search Ranking" description="Forget how often you use each command.">
          <Button size="small" onClick={() => void resetRanking()}>
            Reset
          </Button>
        </Row>
      </Section>
      <Section title="Customize Search">
        <Row title="Include Files in Root Search" description="Show matching files below commands and apps.">
          <SettingSwitch setting="launcher.includeFilesInRootSearch" label="Include Files in Root Search" />
        </Row>
        <Row title="Show Recently Used" description="Suggest recently used items when root search is empty.">
          <SettingSwitch setting="launcher.showRecentlyUsed" label="Show Recently Used" />
        </Row>
      </Section>
      <FallbackCommands />
    </PageFrame>
  );
}
