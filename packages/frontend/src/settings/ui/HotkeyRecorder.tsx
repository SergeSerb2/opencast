import { useEffect, useRef, useState } from "react";
import type { Hotkey, KeyModifier } from "@surgecast/protocol";
import { native } from "../../bridge/native";
import { errorMessage } from "../../bridge/errors";
import { Popover } from "../../components/Popover/Popover";
import { Icon } from "../../icons/Icon";
import { shortcutKeys } from "../../lib/keyboard";
import { hotkeyGlyphs, hotkeyLabel, recordKey, sameHotkey } from "../hotkeys";
import "./hotkey-recorder.css";

export interface HotkeyRecorderProps {
  value: Hotkey | undefined | null;
  /** Save a new hotkey, or null to remove it. Rejecting keeps the recorder open with the error. */
  onChange: (hotkey: Hotkey | null) => Promise<void> | void;
  /** Return who else uses the hotkey (shown in red; the hotkey is not saved). */
  conflict?: (hotkey: Hotkey) => string | null;
  placeholder?: string;
  /** "cell": borderless 24px trigger for tables; "button": small control-surface button. */
  appearance?: "cell" | "button";
  /** Allow removing the hotkey (Backspace in the recorder, × on the trigger). */
  removable?: boolean;
  label?: string;
}

type RecorderState =
  { kind: "idle" } | { kind: "conflict"; hotkey: Hotkey; message: string } | { kind: "error"; message: string } | { kind: "saved"; hotkey: Hotkey } | { kind: "hint"; message: string };

const EXAMPLE: Hotkey = { modifiers: ["opt"], key: "space" };

function Keys({ glyphs, dim }: { glyphs: string[]; dim?: boolean }) {
  return (
    <span className="sc-s-recorder__keys" data-dim={dim || undefined}>
      {glyphs.map((glyph, index) => (
        <kbd key={index} className="sc-s-recorder__key">
          {glyph}
        </kbd>
      ))}
    </span>
  );
}

/**
 * Hotkey trigger + recorder popover (§8.4): 320×170 above the trigger.
 * Inside the Swift host the native recorder (`hotkeys.record`) captures the
 * combination, so system-wide shortcuts such as ⌥Space can be recorded; in a
 * browser the popover listens to key events.
 */
export function HotkeyRecorder({ value, onChange, conflict, placeholder = "Record Hotkey", appearance = "cell", removable = true, label }: HotkeyRecorderProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RecorderState>({ kind: "idle" });
  const [held, setHeld] = useState<KeyModifier[]>([]);
  const session = useRef(0);

  const close = () => {
    session.current++;
    setOpen(false);
    setHeld([]);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const accept = async (hotkey: Hotkey | null): Promise<boolean> => {
    if (hotkey && sameHotkey(hotkey, value)) {
      close();
      return true;
    }
    if (hotkey) {
      const message = conflict?.(hotkey);
      if (message) {
        setState({ kind: "conflict", hotkey, message });
        return false;
      }
    }
    try {
      await onChange(hotkey);
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
      return false;
    }
    if (!hotkey) {
      close();
      return true;
    }
    setState({ kind: "saved", hotkey });
    const token = session.current;
    setTimeout(() => token === session.current && close(), 450);
    return true;
  };

  // Native recording: one `hotkeys.record` call per attempt; conflicts start another attempt.
  useEffect(() => {
    if (!open || !native.available) return;
    const token = ++session.current;
    let cancelled = false;
    const attempt = async () => {
      while (!cancelled && token === session.current) {
        let hotkey: Hotkey | null;
        try {
          hotkey = await native.call("hotkeys.record");
        } catch (error) {
          if (token === session.current) setState({ kind: "error", message: errorMessage(error) });
          return;
        }
        if (cancelled || token !== session.current) return;
        if (!hotkey) return close();
        if (await accept(hotkey)) return;
      }
    };
    void attempt();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one native session per open
  }, [open]);

  // Browser recording: capture key events while the popover is open.
  useEffect(() => {
    if (!open || native.available) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      if (plain && event.key === "Escape") return close();
      if (plain && (event.key === "Backspace" || event.key === "Delete") && removable && value) return void accept(null);
      const recorded = recordKey(event);
      if (recorded.kind === "modifiers") return setHeld(recorded.modifiers);
      setHeld([]);
      if (recorded.kind === "needs-modifier") return setState({ kind: "hint", message: "Add a modifier key like ⌘, ⌥ or ⌃" });
      void accept(recorded.hotkey);
    };
    const onKeyUp = (event: KeyboardEvent) => setHeld((current) => (current.length ? recordKeyModifiers(event) : current));
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read the latest props through closures recreated on open
  }, [open, value]);

  const startRecording = () => {
    setState({ kind: "idle" });
    setHeld([]);
    setOpen(true);
  };

  const glyphs =
    state.kind === "conflict" || state.kind === "saved"
      ? hotkeyGlyphs(state.hotkey)
      : held.length
        ? shortcutKeys({ modifiers: held, key: "" }).slice(0, -1)
        : value
          ? hotkeyGlyphs(value)
          : hotkeyGlyphs(EXAMPLE);
  const message =
    state.kind === "conflict" || state.kind === "error"
      ? state.message
      : state.kind === "saved"
        ? "Hotkey saved"
        : state.kind === "hint"
          ? state.message
          : value
            ? "Press a new hotkey"
            : "Press the keys you want to use";
  const helper = value && removable ? "Press ⌫ to remove · Esc to cancel" : "Esc to cancel";

  return (
    <>
      <span className="sc-s-hotkey" data-appearance={appearance}>
        <button
          ref={triggerRef}
          type="button"
          className="sc-s-hotkey__trigger"
          data-empty={!value || undefined}
          data-state={open ? "open" : "closed"}
          aria-label={label ? `${label}: ${value ? hotkeyLabel(value) : "no hotkey"}` : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? close() : startRecording())}
        >
          {open ? (
            <span className="sc-s-hotkey__recording">Recording…</span>
          ) : value ? (
            <span className="sc-s-hotkey__glyphs">
              {hotkeyGlyphs(value).map((g, i) => (
                <span key={i}>{g}</span>
              ))}
            </span>
          ) : (
            <span className="sc-s-hotkey__placeholder">{placeholder}</span>
          )}
        </button>
        {value && removable && !open && (
          <button type="button" className="sc-s-hotkey__clear" aria-label="Remove hotkey" title="Remove Hotkey" onClick={() => void accept(null)}>
            <Icon name="x-mark-circle-filled-16" size={12} />
          </button>
        )}
      </span>
      <Popover open={open} onClose={close} anchor={triggerRef.current} side="top" align="end" alignOffset={-8} width={320} aria-label="Record Hotkey" role="dialog">
        <div className="sc-s-recorder" data-state={state.kind}>
          <span className="sc-s-recorder__row">
            {!value && state.kind === "idle" && !held.length && <span className="sc-s-recorder__example">e.g.</span>}
            <Keys glyphs={glyphs} dim={!value && state.kind === "idle" && !held.length} />
          </span>
          <span className="sc-s-recorder__message" role={state.kind === "conflict" || state.kind === "error" ? "alert" : "status"}>
            {message}
          </span>
          <span className="sc-s-recorder__helper">{native.available ? "Esc to cancel" : helper}</span>
        </div>
      </Popover>
    </>
  );
}

function recordKeyModifiers(event: KeyboardEvent): KeyModifier[] {
  const recorded = recordKey(event);
  return recorded.kind === "modifiers" ? recorded.modifiers : [];
}
