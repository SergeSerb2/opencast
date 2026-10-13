import { useEffect, useMemo, useState } from "react";
import type { ImageLike, NoteSummary } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { Action, ActionPanel, confirmAlert, EmptyView, ItemDetail, List, Markdown, Metadata, showFailureToast, showHUD, showToast, useRegisterActions, ViewFrame } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher } from "../../launch";
import { formatTimestamp, groupByDate } from "../library/format";
import type { LauncherViewProps } from "../registry";
import { duplicateNoteContent, titleMatchesFirst } from "./notes-model";
import "./notes-search.css";

/** Open the Notes window on a note and close the launcher. */
async function openNote(id: string) {
  await native.call("window.show", { kind: "notes", route: id });
  hideLauncher();
}

async function createNote(content = "") {
  const note = await backend.call("notes.create", { content });
  await openNote(note.id);
}

/** Search Notes: notes by last edit with a rendered preview; opens them in the Notes window. */
export function NotesSearchView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const [text, setText] = useState(props.query ?? "");
  const [query, setQuery] = useState(text.trim());
  const { data: notes, isLoading } = useBackend("notes.list", { query }, undefined, { onError: (error) => showFailureToast("Failed to load notes", error) });
  const navTitle = title ?? "Search Notes";

  // The backend searches titles and full content; debounce keystrokes.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 150);
    return () => clearTimeout(timer);
  }, [text]);

  const sections = useMemo(() => {
    const list = notes ?? [];
    if (query) return [{ title: undefined, items: titleMatchesFirst(list, query) }];
    const pinned = list.filter((n) => n.pinned);
    const rest = list.filter((n) => !n.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
    return [...(pinned.length ? [{ title: "Pinned", items: pinned }] : []), ...groupByDate(rest, (n) => n.updatedAt, { thisYear: false })];
  }, [notes, query]);

  if (notes && notes.length === 0 && !query && !text) return <NoNotes title={navTitle} icon={icon} />;

  const run = async (label: string, operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      showFailureToast(label, error);
    }
  };
  const exportText = async (note: NoteSummary, format: "markdown" | "text") => (await backend.call("notes.export", { id: note.id, format })).content;
  const copy = (note: NoteSummary, format: "markdown" | "text", label: string) =>
    run("Failed to copy note", async () => {
      await native.call("clipboard.write", { content: { kind: "text", text: await exportText(note, format) } });
      await showHUD(label);
    });

  const remove = async (note: NoteSummary) => {
    const confirmed = await confirmAlert({ title: "Delete Note?", message: `“${note.title}” will be deleted. This can’t be undone.`, icon: "trash-16", primaryAction: { title: "Delete", style: "destructive" } });
    if (!confirmed) return;
    await run("Failed to delete note", async () => {
      await backend.call("notes.delete", { id: note.id });
      showToast({ title: "Note deleted" });
    });
  };

  const removeAll = async () => {
    let all: NoteSummary[];
    try {
      all = await backend.call("notes.list", {});
    } catch (error) {
      showFailureToast("Failed to load notes", error);
      return;
    }
    const confirmed = await confirmAlert({ title: "Delete All Notes?", message: `All ${all.length} notes will be deleted. This can’t be undone.`, icon: "trash-16", primaryAction: { title: "Delete All", style: "destructive" } });
    if (!confirmed) return;
    const toast = showToast({ style: "animated", title: "Deleting notes…" });
    try {
      for (const note of all) await backend.call("notes.delete", { id: note.id });
      toast.update({ style: "success", title: "Deleted all notes" });
    } catch (error) {
      toast.update({ style: "failure", title: "Failed to delete notes", message: errorMessage(error) });
    }
  };

  const actionsFor = (note: NoteSummary) => (
    <ActionPanel title={note.title}>
      <ActionPanel.Section>
        <Action title="Open Note" icon="blank-document-16" onAction={() => run("Failed to open note", () => openNote(note.id))} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action
          title={note.pinned ? "Unpin Note" : "Pin Note"}
          icon={note.pinned ? "tack-disabled-16" : "tack-16"}
          shortcut={sc("cmd", "shift", "p")}
          onAction={() =>
            run("Failed to update note", async () => {
              await backend.call("notes.update", { id: note.id, pinned: !note.pinned });
              showToast({ title: note.pinned ? "Unpinned note" : "Pinned note" });
            })
          }
        />
        <Action title="Copy Content" icon="copy-clipboard-16" shortcut={sc("cmd", "shift", "c")} onAction={() => copy(note, "markdown", "Copied to Clipboard")} />
        <ActionPanel.Submenu title="Copy Note As…" icon="copy-clipboard-16" shortcut={sc("cmd", "opt", "c")}>
          <Action title="Markdown" icon="code-16" onAction={() => copy(note, "markdown", "Copied as Markdown")} />
          <Action title="Plain Text" icon="paragraph-16" onAction={() => copy(note, "text", "Copied as Plain Text")} />
        </ActionPanel.Submenu>
        <Action title="Create Note" icon="plus-16" shortcut={sc("cmd", "n")} onAction={() => run("Failed to create note", () => createNote(text.trim()))} />
        <Action
          title="Duplicate Note"
          icon="duplicate-16"
          shortcut={sc("cmd", "d")}
          onAction={() =>
            run("Failed to duplicate note", async () => {
              await backend.call("notes.create", { content: duplicateNoteContent(await exportText(note, "markdown")) });
              showToast({ title: "Duplicated note" });
            })
          }
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action title="Delete Note" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => remove(note)} />
        <Action title="Delete All Notes" icon="trash-16" style="destructive" shortcut={sc("ctrl", "shift", "x")} onAction={removeAll} />
      </ActionPanel.Section>
    </ActionPanel>
  );

  return (
    <List
      searchText={text}
      onSearchTextChange={setText}
      filtering={false}
      isLoading={isLoading || text.trim() !== query}
      isShowingDetail
      searchBarPlaceholder="Search notes…"
      navigationTitle={navTitle}
      navigationIcon={icon}
      actions={
        <ActionPanel>
          <Action title="Create Note" icon="plus-16" shortcut={sc("cmd", "n")} onAction={() => run("Failed to create note", () => createNote(text.trim()))} />
        </ActionPanel>
      }
    >
      {sections.map((section) => (
        <List.Section key={section.title ?? "results"} id={section.title ?? "results"} title={section.title}>
          {section.items.map((note) => (
            <List.Item key={note.id} id={note.id} title={note.title || "Untitled"} icon="blank-document-16" detail={<NoteDetail note={note} />} actions={actionsFor(note)} />
          ))}
        </List.Section>
      ))}
      <List.EmptyView title="No Results" />
    </List>
  );
}

function NoteDetail({ note }: { note: NoteSummary }) {
  // notes.export reads without touching the note (notes.get records an open).
  const { data } = useBackend("notes.export", { id: note.id, format: "markdown" }, [note.id, note.updatedAt]);
  return (
    <ItemDetail
      preview={<div className="sc-note-preview">{data ? <Markdown>{data.content}</Markdown> : <p className="sc-note-preview__plain">{note.preview}</p>}</div>}
      metadata={
        <Metadata>
          <Metadata.Label title="Title" text={note.title || "Untitled"} />
          <Metadata.Label title="Modified" text={formatTimestamp(note.updatedAt)} />
          <Metadata.Label title="Created" text={formatTimestamp(note.createdAt)} />
        </Metadata>
      }
    />
  );
}

/** No notes yet: hide the search field and offer to write the first one. */
function NoNotes({ title, icon }: { title: string; icon?: ImageLike }) {
  return (
    <ViewFrame navigationTitle={title} navigationIcon={icon}>
      <NoNotesBody />
    </ViewFrame>
  );
}

function NoNotesBody() {
  const create = () => void createNote().catch((error: unknown) => showFailureToast("Failed to create note", error));
  useRegisterActions(
    <ActionPanel>
      <Action title="Create Note" icon="plus-16" shortcut={sc("cmd", "n")} onAction={create} />
    </ActionPanel>,
  );
  return <EmptyView title="No Notes Found" description="Write your first note to get started." action={{ title: "Create Note", onAction: create }} />;
}
