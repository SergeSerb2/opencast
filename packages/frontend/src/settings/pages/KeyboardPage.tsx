import { useSetting } from "../../bridge/settings";
import { SettingSelect, SettingSwitch } from "../ui/controls";
import { Row, Section } from "../ui/layout";
import { PageFrame } from "../ui/PageFrame";

const ESCAPE = [
  { value: "pop-back-or-close", title: "Navigate back or close window" },
  { value: "close-window", title: "Close window and pop to root" },
] as const;

const BINDINGS = [
  { value: "macos", title: "Arrow Keys Only" },
  { value: "emacs", title: "Emacs (⌃B, ⌃F, ⌃P, ⌃N)" },
  { value: "vim", title: "Vim Motions (⌃H, ⌃L, ⌃K, ⌃J)" },
] as const;

const PAGE_KEYS = [
  { value: "square-brackets", title: "Square Brackets ([ ])" },
  { value: "page-keys", title: "Page Up / Page Down" },
] as const;

const HYPER = [
  { value: "none", title: "None" },
  { value: "caps-lock", title: "Caps Lock (⇪)" },
  { value: "right-cmd", title: "Right Command (⌘)" },
  { value: "right-opt", title: "Right Option (⌥)" },
] as const;

/** Settings → Keyboard. */
export function KeyboardPage() {
  const hyperKey = useSetting("keyboard.hyperKey");
  return (
    <PageFrame title="Keyboard">
      <Section anchor="keyboard">
        <Row title="Escape Key Behavior" description="What pressing Escape does in the launcher.">
          <SettingSelect setting="keyboard.escapeKeyBehavior" options={ESCAPE} label="Escape Key Behavior" />
        </Row>
        <Row title="Navigation Bindings" description="Extra key bindings for moving through lists, grids and menus.">
          <SettingSelect setting="keyboard.navigationBindings" options={BINDINGS} label="Navigation Bindings" />
        </Row>
        <Row title="Page Navigation Keys" description="Keys that go to the previous or next page in paginated views.">
          <SettingSelect setting="keyboard.pageNavigationKeys" options={PAGE_KEYS} label="Page Navigation Keys" />
        </Row>
      </Section>
      <Section title="Hyper Key" description="Turn a key you rarely use into ⌃⌥⇧⌘ — a modifier no app claims, so hotkeys built on it never conflict.">
        <Row title="Hyper Key">
          <SettingSelect setting="keyboard.hyperKey" options={HYPER} label="Hyper Key" />
        </Row>
        <Row title="Include Shift in Hyper Key" description="Turn off to make the Hyper Key ⌃⌥⌘, leaving ⇧ free to combine with it." disabled={hyperKey === "none"}>
          <SettingSwitch setting="keyboard.hyperKeyIncludeShift" disabled={hyperKey === "none"} label="Include Shift in Hyper Key" />
        </Row>
      </Section>
    </PageFrame>
  );
}
