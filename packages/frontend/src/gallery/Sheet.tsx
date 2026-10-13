import { useState, type ReactNode } from "react";
import {
  ActionButton,
  ActivityIndicator,
  AliasBadge,
  Badge,
  Button,
  Checkbox,
  Dropdown,
  EmptyView,
  IconButton,
  InlineToast,
  Keycap,
  LoadingBar,
  Markdown,
  Menu,
  Metadata,
  MetadataView,
  NumberBadge,
  SegmentedControl,
  Shortcut,
  Spinner,
  Switch,
  Tag,
  TagInput,
  TextArea,
  TextField,
  confirmAlert,
  showToast,
} from "../components";
import { ListItemRow } from "../components/List/ListItemRow";
import { tile } from "../bridge/mock/fixtures/commands";
import { RAYCAST_ICONS } from "../icons/raycast-icons.generated";
import { Image } from "../icons/Image";
import { OpenCastLogo } from "../icons/glyphs";
import { sc } from "../lib/keyboard";
import { ThemeScope, type Appearance } from "../theme/ThemeProvider";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gallery-section">
      <h2 className="gallery-section__title">{title}</h2>
      <div className="gallery-section__body">{children}</div>
    </section>
  );
}

const ICON_NAMES = Object.keys(RAYCAST_ICONS);

function Controls() {
  const [on, setOn] = useState(true);
  const [check, setCheck] = useState(true);
  const [segment, setSegment] = useState<"list" | "grid" | "detail">("list");
  const [text, setText] = useState("OpenCast");
  const [area, setArea] = useState("Multi-line text\ngrows with content");
  const [tags, setTags] = useState(["design", "launcher"]);
  const [choice, setChoice] = useState("all");
  return (
    <>
      <Section title="Switch · Checkbox · Segmented control">
        <div className="gallery-row">
          <Switch checked={on} onChange={setOn} label="Enabled" />
          <Switch checked={!on} onChange={(v) => setOn(!v)} label="Disabled" />
          <Switch checked={on} onChange={setOn} size="large" label="Large" />
          <Checkbox checked={check} onChange={setCheck} label="Checked" />
          <Checkbox checked="indeterminate" onChange={() => undefined} label="Mixed" />
          <Checkbox checked={false} onChange={() => undefined} label="Off" />
        </div>
        <div className="gallery-row">
          <SegmentedControl value={segment} onChange={setSegment} segments={[{ value: "list", title: "List" }, { value: "grid", title: "Grid" }, { value: "detail", title: "Detail" }]} />
          <SegmentedControl value={segment} onChange={setSegment} size="medium" segments={[{ value: "list", icon: "list-16" }, { value: "grid", icon: "app-window-grid-2x2-16" }, { value: "detail", icon: "sidebar-16" }]} />
        </div>
      </Section>
      <Section title="Fields">
        <div className="gallery-stack">
          <TextField value={text} onChange={setText} placeholder="Name" />
          <TextField value="" onChange={() => undefined} placeholder="Snippet name" accessory={<button type="button" className="gallery-accessory"><Image source="blank-document-16" size={16} /></button>} />
          <TextField value="bad value" onChange={() => undefined} validation="error" leadingIcon="magnifying-glass-16" />
          <TextField value="" onChange={() => undefined} size="small" placeholder="Small" />
          <TextArea value={area} onChange={setArea} placeholder="Notes" />
          <TagInput value={tags} onChange={setTags} placeholder="Tags" />
          <Dropdown value={choice} onChange={setChoice} items={[{ value: "all", title: "All Applications", icon: "app-window-16" }, { value: "mail", title: "Mail", icon: "envelope-16" }]} />
          <div className="gallery-row">
            <Dropdown variant="nav" icon="list-16" value={choice} onChange={setChoice} items={[{ value: "all", title: "All Types" }, { value: "mail", title: "Text Only" }]} />
          </div>
        </div>
      </Section>
    </>
  );
}

function Column({ appearance }: { appearance: Appearance }) {
  return (
    <ThemeScope appearance={appearance}>
      <div className="theme-root gallery-column" {...{ [appearance]: "" }} data-window="main">
        <h1 className="gallery-column__title">{appearance === "dark" ? "Dark" : "Light"}</h1>

        <Section title="Keycaps & shortcuts">
          <div className="gallery-row">
            <Keycap>⌘</Keycap>
            <Keycap>K</Keycap>
            <Keycap size="medium">⇥</Keycap>
            <Keycap variant="prominent">Esc</Keycap>
            <Keycap variant="success">↵</Keycap>
            <Keycap variant="error">⌫</Keycap>
            <Shortcut shortcut={sc("ctrl", "opt", "shift", "cmd", "v")} />
            <Shortcut shortcut={sc("cmd", "return")} />
          </div>
        </Section>

        <Section title="Buttons">
          <div className="gallery-row">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive" icon="trash-16">Delete</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="standout">Standout</Button>
          </div>
          <div className="gallery-row">
            <Button size="mini">Mini</Button>
            <Button size="small" icon="plus-16">Small</Button>
            <Button size="large">Large</Button>
            <Button variant="glass">Glass</Button>
            <Button variant="primary">Primary</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="gallery-row">
            <IconButton icon="cog-16" label="Settings" />
            <IconButton icon="plus-16" label="Add" variant="secondary" />
            <IconButton icon="arrow-up-16" label="Send" variant="primary" size={28} />
            <IconButton icon="command-symbol-16" label="Actions" variant="glass" size={36} iconSize={18} />
          </div>
        </Section>

        <Section title="Badges, tags, alias">
          <div className="gallery-row">
            <Tag>Default</Tag>
            <Tag color="raycast-green">Draft</Tag>
            <Tag color="raycast-purple" icon="star-16">Starred</Tag>
            <Tag color="#ff6fae">Custom</Tag>
            <Badge>Gray</Badge>
            <Badge color="blue">Blue</Badge>
            <Badge color="green" size="medium">Green</Badge>
            <Badge color="red" size="large" icon="warning-16">Error</Badge>
            <NumberBadge value={3} />
            <NumberBadge value={12} size="large" accent />
            <AliasBadge alias="cl" />
            <AliasBadge alias="gh" variant="outlined" />
          </div>
        </Section>

        <Controls />

        <Section title="Loading">
          <div className="gallery-row">
            <Spinner />
            <ActivityIndicator state="pending" />
            <ActivityIndicator state="success" />
            <ActivityIndicator state="warning" />
            <ActivityIndicator state="failure" />
            <div className="gallery-loading-bar">
              <LoadingBar loading delay={0} />
            </div>
          </div>
        </Section>

        <Section title="Icons & images">
          <div className="gallery-icons">
            {ICON_NAMES.slice(0, 96).map((name) => (
              <span key={name} title={name} className="gallery-icon">
                <Image source={name} size={16} />
              </span>
            ))}
          </div>
          <div className="gallery-row">
            <Image source={tile("clipboard-16", "#FFA24A", "#F2711C")} size={22} />
            <Image source={tile("snippets-16", "#5AB8FF", "#2D7FF0")} size={22} />
            <Image source={tile("stars-16", "#FF7BC1", "#E2408F")} size={22} />
            <Image source={tile("magnifying-glass-16", "#7C8CFF", "#4F5BEA")} size={22} />
            <Image source={tile("terminal-16", "#5E6270", "#34363E")} size={32} />
            <Image source="🚀" size={22} />
            <Image source={{ source: "star-filled-16", tintColor: "raycast-yellow" }} size={16} />
            <Image source={{ source: "circle-filled-16", tintColor: "raycast-green" }} size={16} />
            <Image source={{ source: "x-mark-circle-filled-16", tintColor: "raycast-red" }} size={16} />
            <Image source="number-07-16" size={16} />
            <Image source={{ fileIcon: "/Applications/Safari.app" }} size={22} />
            <Image source={{ fileIcon: "/Users/me/Documents/" }} size={22} />
            <span className="gallery-logo">
              <OpenCastLogo size={22} />
            </span>
          </div>
        </Section>

        <Section title="List rows">
          <div className="gallery-list">
            <div style={{ height: 38 }}>
              <ListItemRow domId="g1" size="large" selected item={{ id: "1", title: "Clipboard History", subtitle: "Clipboard History", icon: tile("clipboard-16", "#FFA24A", "#F2711C"), accessories: [{ alias: "cl" }, { shortcut: sc("cmd", "shift", "v") }, { text: "Command" }] }} onMouseDown={() => undefined} onClick={() => undefined} onDoubleClick={() => undefined} />
            </div>
            <div style={{ height: 38 }}>
              <ListItemRow domId="g2" size="large" selected={false} item={{ id: "2", title: "Safari", icon: tile("compass-16", "#5AB8FF", "#2D7FF0"), iconDot: "default", accessories: [{ text: "Application" }] }} onMouseDown={() => undefined} onClick={() => undefined} onDoubleClick={() => undefined} />
            </div>
            <div style={{ height: 38 }}>
              <ListItemRow domId="g3" size="large" selected={false} item={{ id: "3", title: "Create AI Command", icon: tile("wand-16", "#FF6B6B", "#E5383B"), accessories: [{ text: { value: "Draft", color: "raycast-green" } }] }} onMouseDown={() => undefined} onClick={() => undefined} onDoubleClick={() => undefined} />
            </div>
            <div style={{ height: 36 }}>
              <ListItemRow domId="g4" size="small" selected={false} item={{ id: "4", title: "Small row", icon: "star-16", accessories: [{ tag: { value: "Tag", color: "raycast-blue" } }, { date: new Date(Date.now() - 7200_000) }] }} onMouseDown={() => undefined} onClick={() => undefined} onDoubleClick={() => undefined} />
            </div>
          </div>
        </Section>

        <Section title="Menu (action panel rows)">
          <div className="gallery-menu sc-glass-panel">
            <Menu
              title="Create AI Command"
              searchPlaceholder="Search for actions…"
              sections={[
                { items: [{ id: "open", title: "Open Draft", icon: "arrow-ne-16", shortcut: sc("return") }, { id: "discard", title: "Discard Draft", icon: "trash-16", style: "destructive", shortcut: sc("ctrl", "x") }] },
                { title: "Copy", items: [{ id: "copy", title: "Copy Link", icon: "link-16", shortcut: sc("cmd", "shift", "c") }, { id: "submenu", title: "Move To", icon: "folder-16", hasSubmenu: true }] },
              ]}
              onSelect={(item) => showToast({ title: item.title })}
              onDismiss={() => undefined}
            />
          </div>
        </Section>

        <Section title="Footer pills">
          <div className="gallery-footer">
            <div className="sc-footer__pill sc-glass-control">
              <ActionButton variant="secondary" outset leading={<Image source={tile("clipboard-16", "#FFA24A", "#F2711C")} size={18} />} title="Clipboard History" />
            </div>
            <div className="sc-footer__pill sc-glass-control">
              <ActionButton title="Open Command" shortcut={sc("return")} />
              <ActionButton variant="secondary" title="Actions" shortcut={sc("cmd", "k")} />
            </div>
          </div>
        </Section>

        <Section title="Toasts">
          <div className="gallery-stack gallery-toasts">
            <InlineToast style="default" title="Saved" />
            <InlineToast style="animated" title="Syncing" message="12 changes" />
            <InlineToast style="success" title="Copied to Clipboard" />
            <InlineToast style="failure" title="Failed to connect" message="Check the server URL" />
            <div className="gallery-row">
              <Button size="small" onClick={() => showToast({ style: "success", title: "Toast shown", message: "in the footer" })}>Show toast</Button>
              <Button size="small" variant="destructive" onClick={() => void confirmAlert({ title: "Delete Snippet?", message: "This can't be undone.", primaryAction: { title: "Delete", style: "destructive" } })}>
                Confirm alert
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Empty view">
          <div className="gallery-empty">
            <EmptyView title="No Snippets Found" description="Create your first snippet to get started." action={{ title: "Create Snippet", onAction: () => undefined }} />
          </div>
        </Section>

        <Section title="Metadata">
          <div className="gallery-metadata">
            <MetadataView layout="wide" title="Information">
              <Metadata.Label title="Source" text="Safari" />
              <Metadata.Label title="Type" text="Link" />
              <Metadata.TagList title="Tags">
                <Metadata.TagList.Item text="work" color="raycast-blue" />
                <Metadata.TagList.Item text="urgent" color="raycast-red" />
              </Metadata.TagList>
              <Metadata.Link title="URL" text="opencast.app" target="https://opencast.app" />
            </MetadataView>
            <MetadataView layout="narrow">
              <Metadata.Label title="Author" text="Mira" icon="person-16" />
              <Metadata.Label title="Status" text={{ value: "Merged", color: "raycast-purple" }} />
            </MetadataView>
          </div>
        </Section>

        <Section title="Markdown">
          <div className="gallery-markdown">
            <Markdown>{"## Detail markdown\n\nParagraph with **bold**, `inline code` and a [link](https://opencast.app).\n\n- one\n- two\n\n- [x] done\n- [ ] todo\n\n```js\nconst x = 42; // answer\n```"}</Markdown>
            <Markdown variant="chat">{"### Chat markdown\n\nBody text at 14px with a [link](https://opencast.app).\n\n```ts\nexport function add(a: number, b: number) {\n  return a + b;\n}\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |"}</Markdown>
          </div>
        </Section>
      </div>
    </ThemeScope>
  );
}

/** Every component in dark and light, side by side. */
export function Sheet() {
  return (
    <div className="gallery">
      <Column appearance="dark" />
      <Column appearance="light" />
    </div>
  );
}
