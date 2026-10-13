import { Button, IconButton } from "../../components/Button/Button";
import { showFailureToast } from "../../components/feedback/toast-store";
import { Image } from "../../icons/Image";
import { showInFinder } from "../actions";
import { tildePath } from "../lists";
import { CardEmpty } from "./layout";
import { chooseFiles } from "./prompt";
import "./apps.css";

export interface PathListEditorProps {
  value: readonly string[];
  /** Called with folders to add (already de-duplicated). */
  onAdd: (paths: string[]) => void;
  onRemove: (path: string) => void;
  emptyTitle: string;
  emptyDescription?: string;
  addTitle?: string;
  canChooseFiles?: boolean;
  allowedTypes?: string[];
}

/** Folder list with Add Folder… (native open panel) and per-row Show in Finder / Remove. */
export function PathListEditor({ value, onAdd, onRemove, emptyTitle, emptyDescription, addTitle = "Add Folder…", canChooseFiles = false, allowedTypes }: PathListEditorProps) {
  const add = async () => {
    try {
      const picked = await chooseFiles({ canChooseFiles, canChooseDirectories: !canChooseFiles, allowedTypes, allowMultipleSelection: true, title: addTitle.replace("…", ""), prompt: "Add" });
      const fresh = (picked ?? []).filter((path) => !value.includes(path));
      if (fresh.length) onAdd(fresh);
    } catch (error) {
      showFailureToast("Could not open the folder picker", error);
    }
  };
  return (
    <div className="sc-s-applist">
      {value.length ? (
        value.map((path) => (
          <div key={path} className="sc-s-applist__item">
            <Image source={path.startsWith("/") ? { fileIcon: path } : "folder-16"} size={20} />
            <span className="sc-s-applist__name sc-truncate" title={path}>
              {tildePath(path)}
            </span>
            {path.startsWith("/") && <IconButton icon="finder-16" label="Show in Finder" onClick={() => showInFinder(path)} />}
            <IconButton icon="minus-circle-16" label={`Remove ${tildePath(path)}`} onClick={() => onRemove(path)} />
          </div>
        ))
      ) : (
        <CardEmpty title={emptyTitle} description={emptyDescription} />
      )}
      <div className="sc-s-applist__footer">
        <Button size="small" icon="plus-16" onClick={() => void add()}>
          {addTitle}
        </Button>
      </div>
    </div>
  );
}
