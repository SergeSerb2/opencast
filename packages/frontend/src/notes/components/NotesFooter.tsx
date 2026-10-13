import type { Editor } from "@tiptap/core";
import { Shortcut } from "../../components/Keycap/Keycap";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { Icon } from "../../icons/Icon";
import { showFailureToast } from "../../components/feedback/toast-store";
import { setSetting, useSetting } from "../../bridge/settings";
import { setNotesPreference, useNotesPreferences } from "../lib/preferences";
import { NOTES_SHORTCUTS as S } from "../lib/shortcuts";
import { pluralize } from "../lib/text";
import { useNotesStore } from "../store";
import { FormatBar } from "./FormatBar";

/**
 * Floating footer (§7.2): the character/word counter (click toggles the
 * unit), or the formatting pill, and the format-bar toggle at the right.
 */
export function NotesFooter({ editor }: { editor: Editor | null }) {
  const alwaysOnTop = useSetting("notes.alwaysOnTop");
  const formatBarVisible = useNotesPreferences((state) => state.formatBarVisible);
  const countMode = useNotesPreferences((state) => state.countMode);
  const characters = useNotesStore((state) => state.characters);
  const words = useNotesStore((state) => state.words);
  const label = countMode === "words" ? pluralize(words, "word") : pluralize(characters, "character");
  return (
    <div className="sc-notes-footer">
      <Tooltip content={<span className="sc-notes-tooltip">Always on Top<Shortcut shortcut={S.alwaysOnTop} /></span>}>
        <button
          type="button"
          className="sc-notes-footer__toggle sc-notes-footer__pin sc-glass-control"
          aria-label="Always on Top"
          aria-pressed={alwaysOnTop}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void setSetting("notes.alwaysOnTop", !alwaysOnTop).catch((error: unknown) => showFailureToast("Could not change Always on Top", error))}
        >
          <Icon name="pin-16" size={16} />
        </button>
      </Tooltip>
      {formatBarVisible && editor ? (
        <FormatBar editor={editor} />
      ) : (
        <button
          type="button"
          className="sc-notes-counter"
          aria-label={`${label}, click to count ${countMode === "words" ? "characters" : "words"}`}
          onClick={() => setNotesPreference("countMode", countMode === "words" ? "characters" : "words")}
        >
          {label}
        </button>
      )}
      <Tooltip
        content={
          <span className="sc-notes-tooltip">
            {formatBarVisible ? "Hide Format Bar" : "Show Format Bar"}
            <Shortcut shortcut={S.formatBar} />
          </span>
        }
      >
        <button
          type="button"
          className="sc-notes-footer__toggle sc-glass-control sc-glass-press"
          aria-label={formatBarVisible ? "Hide Format Bar" : "Show Format Bar"}
          aria-pressed={formatBarVisible}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setNotesPreference("formatBarVisible", !formatBarVisible)}
        >
          <Icon name={formatBarVisible ? "x-mark-circle-filled-16" : "text-16"} size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
