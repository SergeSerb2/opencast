import { useState } from "react";
import type { BackendParams, ScriptCommand } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { errorMessage } from "../../bridge/errors";
import { Button } from "../../components/Button/Button";
import { TextField } from "../../components/TextField/TextField";
import { showToast } from "../../components/feedback/toast-store";
import { Image } from "../../icons/Image";
import { showInFinder } from "../actions";
import { tildePath } from "../lists";
import { Select } from "../ui/controls";
import { Dialog, DialogField } from "../ui/Dialog";
import { CardEmpty, Section } from "../ui/layout";

type CreateParams = BackendParams<"scripts.create">;

const MODES: { value: ScriptCommand["mode"]; title: string }[] = [
  { value: "fullOutput", title: "Full Output" },
  { value: "compact", title: "Compact (last line in a toast)" },
  { value: "silent", title: "Silent (HUD when done)" },
  { value: "inline", title: "Inline (output in root search)" },
];

const LANGUAGES: { value: CreateParams["language"]; title: string }[] = [
  { value: "bash", title: "Bash" },
  { value: "python", title: "Python" },
  { value: "node", title: "Node.js" },
  { value: "applescript", title: "AppleScript" },
  { value: "swift", title: "Swift" },
  { value: "ruby", title: "Ruby" },
];

const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.value, m.title.split(" (")[0]]));

function CreateScriptDialog({ directories, onClose, onCreated }: { directories: readonly string[]; onClose: () => void; onCreated: (script: ScriptCommand) => void }) {
  const [title, setTitle] = useState("");
  const [packageName, setPackageName] = useState("");
  const [mode, setMode] = useState<ScriptCommand["mode"]>("fullOutput");
  const [language, setLanguage] = useState<CreateParams["language"]>("bash");
  const [directory, setDirectory] = useState(directories[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) return setError("Give the script a title");
    setBusy(true);
    try {
      const script = await backend.call("scripts.create", { directory, title: title.trim(), mode, language, packageName: packageName.trim() || undefined });
      onCreated(script);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Create Script Command"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={busy || !directory}>
            Create Script
          </Button>
        </>
      }
    >
      <DialogField label="Title" error={error}>
        <TextField value={title} onChange={setTitle} placeholder="Toggle Wi-Fi" />
      </DialogField>
      <DialogField label="Package Name" hint="Shown as the subtitle in root search.">
        <TextField value={packageName} onChange={setPackageName} placeholder="Network" />
      </DialogField>
      <DialogField label="Language">
        <Select variant="field" value={language} options={LANGUAGES} onChange={setLanguage} label="Language" />
      </DialogField>
      <DialogField label="Output Mode">
        <Select variant="field" value={mode} options={MODES} onChange={setMode} label="Output Mode" />
      </DialogField>
      <DialogField label="Folder">
        <Select variant="field" value={directory} options={directories.map((d) => ({ value: d, title: tildePath(d) }))} onChange={setDirectory} label="Folder" />
      </DialogField>
    </Dialog>
  );
}

/** Discovered scripts and a "Create Script Command" form (writes a template into a script folder). */
export function ScriptCommandsSection({ scripts, directories, onCreated }: { scripts: readonly ScriptCommand[]; directories: readonly string[]; onCreated: () => void }) {
  const [creating, setCreating] = useState(false);
  return (
    <Section
      title="Scripts"
      description={`${scripts.length} script command${scripts.length === 1 ? "" : "s"} found.`}
      actions={
        <Button size="small" onClick={() => setCreating(true)} disabled={!directories.length} title={directories.length ? undefined : "Add a script folder first"}>
          Create Script Command
        </Button>
      }
    >
      {scripts.length ? (
        scripts.map((script) => (
          <div key={script.path} className="sc-s-item sc-s-row" data-align="center">
            <Image source={script.icon ?? "terminal-16"} size={16} />
            <div className="sc-s-row__label">
              <div className="sc-s-row__title">{script.title}</div>
              <div className="sc-s-description">{tildePath(script.path)}</div>
            </div>
            <span className="sc-s-badge">{MODE_LABEL[script.mode] ?? script.mode}</span>
            <Button size="small" variant="ghost" onClick={() => showInFinder(script.path)}>
              Show in Finder
            </Button>
          </div>
        ))
      ) : (
        <CardEmpty title="No Script Commands" description="Scripts need a `@raycast.title` (or `@surgecast.title`) comment to appear here." />
      )}
      {creating && (
        <CreateScriptDialog
          directories={directories}
          onClose={() => setCreating(false)}
          onCreated={(script) => {
            setCreating(false);
            onCreated();
            showToast({ style: "success", title: `Created ${script.title}`, message: tildePath(script.path) });
          }}
        />
      )}
    </Section>
  );
}
