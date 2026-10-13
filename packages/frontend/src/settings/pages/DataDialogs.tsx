import { useState } from "react";
import { backend } from "../../bridge/backend";
import { errorMessage } from "../../bridge/errors";
import { Button } from "../../components/Button/Button";
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { Spinner } from "../../components/Spinner/Spinner";
import { TextField } from "../../components/TextField/TextField";
import { Icon } from "../../icons/Icon";
import { tildePath } from "../lists";
import { Dialog, DialogField } from "../ui/Dialog";
import "./data-dialogs.css";

interface Category {
  id: string;
  title: string;
}

/** Categories a Raycast export can contain that OpenCast imports. */
export const RAYCAST_IMPORT_CATEGORIES: readonly Category[] = [
  { id: "settings", title: "Settings, Aliases & Hotkeys" },
  { id: "snippets", title: "Snippets" },
  { id: "quicklinks", title: "Quicklinks" },
  { id: "notes", title: "Notes" },
  { id: "themes", title: "Themes" },
  { id: "ai", title: "AI Commands & Agents" },
];

/** Collections an OpenCast export can contain (`data.export` categories). */
export const EXPORT_CATEGORIES: readonly Category[] = [
  { id: "settings", title: "Settings" },
  { id: "commandPrefs", title: "Aliases, Hotkeys & Favorites" },
  { id: "snippets", title: "Snippets" },
  { id: "quicklinks", title: "Quicklinks" },
  { id: "notes", title: "Notes" },
  { id: "aiCommands", title: "AI Commands" },
  { id: "aiPresets", title: "Agents" },
  { id: "aiChats", title: "AI Chats" },
  { id: "aiProviders", title: "AI Providers (without API keys)" },
  { id: "themes", title: "Themes" },
  { id: "windowLayouts", title: "Window Layouts" },
];

const categoryTitle = (categories: readonly Category[], id: string) => categories.find((c) => c.id === id)?.title ?? id;

function CategoryChecklist({ categories, selected, onChange }: { categories: readonly Category[]; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const all = selected.size === categories.length;
  return (
    <div className="sc-s-checklist">
      <Checkbox checked={all ? true : selected.size ? "indeterminate" : false} onChange={() => onChange(all ? new Set() : new Set(categories.map((c) => c.id)))} label="All Categories" />
      <div className="sc-s-checklist__items">
        {categories.map((category) => (
          <Checkbox
            key={category.id}
            checked={selected.has(category.id)}
            onChange={(checked) => {
              const next = new Set(selected);
              if (checked) next.add(category.id);
              else next.delete(category.id);
              onChange(next);
            }}
            label={category.title}
          />
        ))}
      </div>
    </div>
  );
}

type ImportResult = { category: string; imported: number; error?: string };

function ResultList({ results, categories }: { results: ImportResult[]; categories: readonly Category[] }) {
  return (
    <ul className="sc-s-results">
      {results.map((result) => (
        <li key={result.category} className="sc-s-results__item" data-failed={result.error ? "" : undefined}>
          <Icon name={result.error ? "x-mark-circle-16" : "check-circle-16"} size={16} />
          <span className="sc-s-results__title">{categoryTitle(categories, result.category)}</span>
          <span className="sc-s-results__detail sc-truncate" title={result.error}>
            {result.error ?? `${result.imported} imported`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Import a Raycast `.rayconfig`: pick categories, enter the export password
 * (if it has one), then show what was imported per category.
 */
export function ImportDialog({ path, format, onClose }: { path: string; format: "rayconfig" | "opencast"; onClose: () => void }) {
  const categories = RAYCAST_IMPORT_CATEGORIES;
  const [selected, setSelected] = useState(() => new Set(categories.map((c) => c.id)));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const run = async () => {
    if (busy || (format === "rayconfig" && !selected.size)) return;
    setBusy(true);
    setError(null);
    try {
      const response =
        format === "rayconfig"
          ? await backend.call("data.importRayconfig", { path, password: password || undefined, categories: [...selected] })
          : await backend.call("data.import", { path, password: password || undefined });
      setPassword("");
      setResults(response.results);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const fileName = path.split("/").pop() ?? path;
  return (
    <Dialog
      title={format === "rayconfig" ? "Import from Raycast" : "Import OpenCast Data"}
      onClose={onClose}
      width={440}
      footer={
        results ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void run()} disabled={busy || (format === "rayconfig" && !selected.size)}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </>
        )
      }
    >
      <div className="sc-s-file-chip" title={path}>
        <Icon name="blank-document-16" size={16} />
        <span className="sc-truncate">{fileName}</span>
        <span className="sc-s-file-chip__path sc-truncate">{tildePath(path.slice(0, path.length - fileName.length))}</span>
      </div>
      {results ? (
        <ResultList results={results} categories={categories} />
      ) : (
        <>
          {format === "rayconfig" && (
            <DialogField label="Import">
              <CategoryChecklist categories={categories} selected={selected} onChange={setSelected} />
            </DialogField>
          )}
          <DialogField label="Password" hint="Leave empty if the export isn't password-protected." error={error}>
            <TextField type="password" value={password} onChange={setPassword} placeholder="Export password" onKeyDown={(event) => event.key === "Enter" && void run()} />
          </DialogField>
          {busy && (
            <div className="sc-s-dialog-text sc-s-busy">
              <Spinner size={14} /> Reading and importing your data…
            </div>
          )}
          {format === "rayconfig" && (
            <p className="sc-s-dialog-text">Existing items are kept; imported items are added next to them. Clipboard history, extensions and credentials are not imported.</p>
          )}
        </>
      )}
    </Dialog>
  );
}

function exportFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `OpenCast ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.openconfig`;
}

/** Export selected collections to an encrypted (or plain) file in `directory`. */
export function ExportDialog({ directory, onClose, onExported }: { directory: string; onClose: () => void; onExported: (path: string) => void }) {
  const [selected, setSelected] = useState(() => new Set(EXPORT_CATEGORIES.map((c) => c.id)));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = password !== confirm && confirm.length > 0;
  const tooShort = password.length > 0 && password.length < 8;

  const run = async () => {
    if (busy || !selected.size || password !== confirm || tooShort) return;
    setBusy(true);
    setError(null);
    try {
      const path = `${directory.replace(/\/$/, "")}/${exportFileName()}`;
      const result = await backend.call("data.export", { path, password: password || undefined, categories: [...selected] });
      onExported(result.path);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Export Data"
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void run()} disabled={busy || !selected.size || mismatch || tooShort || (password.length > 0 && confirm !== password)}>
            {busy ? "Exporting…" : "Export"}
          </Button>
        </>
      }
    >
      <div className="sc-s-file-chip" title={directory}>
        <Icon name="folder-16" size={16} />
        <span className="sc-truncate">{tildePath(directory)}</span>
      </div>
      <DialogField label="Include">
        <CategoryChecklist categories={EXPORT_CATEGORIES} selected={selected} onChange={setSelected} />
      </DialogField>
      <DialogField label="Password" hint="Recommended. The file is encrypted with this password; without it, anyone with the file can read it." error={tooShort ? "Use at least 8 characters" : error}>
        <TextField type="password" value={password} onChange={setPassword} placeholder="Optional" />
      </DialogField>
      {password.length > 0 && (
        <DialogField label="Confirm Password" error={mismatch ? "Passwords don't match" : null}>
          <TextField type="password" value={confirm} onChange={setConfirm} placeholder="Repeat password" />
        </DialogField>
      )}
      <p className="sc-s-dialog-text">API keys, sync credentials and other secrets stay in your Keychain and are never exported.</p>
    </Dialog>
  );
}
