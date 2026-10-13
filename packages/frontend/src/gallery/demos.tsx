import { useEffect, useState } from "react";
import { Action, ActionPanel, Detail, Form, Grid, List, Metadata, showToast } from "../components";
import { tile } from "../bridge/mock/fixtures/commands";
import { SAMPLE_IMAGE } from "../bridge/mock/fixtures/content";
import { sc } from "../lib/keyboard";

/**
 * Full-window demos of the view components with gallery data. They double as
 * usage examples for built-in views.
 */

const FRUITS = [
  { id: "apple", title: "Apple", subtitle: "Malus domestica", icon: "🍎", tag: "Fruit", color: "raycast-red" as const },
  { id: "banana", title: "Banana", subtitle: "Musa", icon: "🍌", tag: "Fruit", color: "raycast-yellow" as const },
  { id: "carrot", title: "Carrot", subtitle: "Daucus carota", icon: "🥕", tag: "Vegetable", color: "raycast-orange" as const },
  { id: "grapes", title: "Grapes", subtitle: "Vitis vinifera", icon: "🍇", tag: "Fruit", color: "raycast-purple" as const },
];

function itemActions(title: string) {
  return (
    <ActionPanel title={title}>
      <Action title="Open" icon="arrow-ne-16" onAction={() => showToast({ title: `Opened ${title}` })} />
      <Action.CopyToClipboard content={title} shortcut={sc("cmd", "shift", "c")} />
      <ActionPanel.Section title="Item">
        <Action title="Add to Favorites" icon="star-16" shortcut={sc("cmd", "shift", "f")} onAction={() => showToast({ title: "Added to Favorites" })} />
        <ActionPanel.Submenu title="Set Priority" icon="flag-16" shortcut={sc("cmd", "shift", "p")}>
          <Action title="High" icon={{ source: "circle-filled-16", tintColor: "raycast-red" }} onAction={() => showToast({ title: "Priority: High" })} />
          <Action title="Medium" icon={{ source: "circle-filled-16", tintColor: "raycast-yellow" }} onAction={() => showToast({ title: "Priority: Medium" })} />
          <Action title="Low" icon={{ source: "circle-filled-16", tintColor: "raycast-blue" }} onAction={() => showToast({ title: "Priority: Low" })} />
        </ActionPanel.Submenu>
        <Action title="Delete" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => showToast({ style: "failure", title: "Deleted", message: title })} />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

export function ListDemo() {
  return (
    <List searchBarPlaceholder="Search groceries…" navigationTitle="Groceries" navigationIcon={tile("cart-16", "#5FE0A0", "#21B26B")}>
      <List.Section title="Produce" subtitle={String(FRUITS.length)}>
        {FRUITS.map((f) => (
          <List.Item key={f.id} id={f.id} title={f.title} subtitle={f.subtitle} icon={f.icon} accessories={[{ tag: { value: f.tag, color: f.color } }, { text: "2 kg" }]} actions={itemActions(f.title)} />
        ))}
      </List.Section>
      <List.Section title="Pantry">
        <List.Item title="Olive Oil" icon={tile("droplets-16", "#FFD45C", "#F5A623")} accessories={[{ date: new Date(Date.now() - 3 * 3600_000) }, { icon: "star-filled-16", tooltip: "Favorite" }]} actions={itemActions("Olive Oil")} />
        <List.Item title="Coffee Beans" subtitle="Ethiopia" icon={tile("mug-steam-16", "#8E95A6", "#5B6273")} accessories={[{ alias: "cof" }, { shortcut: sc("cmd", "opt", "c") }, { text: "Command" }]} actions={itemActions("Coffee Beans")} />
        <List.Item title="Sea Salt" icon={tile("snowflake-16", "#5AB8FF", "#2D7FF0")} accessories={[{ text: { value: "Low", color: "raycast-green" } }]} actions={itemActions("Sea Salt")} />
      </List.Section>
    </List>
  );
}

export function ListDetailDemo() {
  return (
    <List isShowingDetail navigationTitle="Clipboard History" navigationIcon={tile("clipboard-16", "#FFA24A", "#F2711C")} searchBarPlaceholder="Type to filter entries…" searchBarAccessory={
      <List.Dropdown tooltip="Type" storeValue={false}>
        <List.Dropdown.Item title="All Types" value="all" icon="list-16" />
        <List.Dropdown.Item title="Text Only" value="text" icon="text-16" />
        <List.Dropdown.Item title="Images Only" value="image" icon="image-16" />
      </List.Dropdown>
    }>
      <List.Section title="Today">
        {["Ship the launcher redesign", "https://github.com/opencast", "#7C5CFF", "const theme = usePalette()"].map((text, i) => (
          <List.Item
            key={i}
            title={text}
            icon={i === 1 ? "link-16" : i === 2 ? { source: "circle-filled-16", tintColor: "#7C5CFF" } : "blank-document-16"}
            detail={
              <List.Item.Detail
                markdown={i === 3 ? "```ts\nconst theme = usePalette(appearance);\n```" : text}
                metadata={
                  <Metadata>
                    <Metadata.Label title="Source" text="Slack" icon={tile("hashtag-16", "#B58CFF", "#8156F0")} />
                    <Metadata.Label title="Type" text="Text" />
                    <Metadata.Label title="Characters" text={String(text.length)} />
                    <Metadata.Label title="Words" text={String(text.split(/\s+/).length)} />
                    <Metadata.Label title="Copied" text="Today at 10:24" />
                  </Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action title="Paste to Safari" icon="clipboard-16" onAction={() => showToast({ title: "Pasted" })} />
                <Action.CopyToClipboard content={text} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="Yesterday">
        <List.Item title="Quarterly Report.pdf" icon={{ fileIcon: "/Users/me/Documents/Quarterly Report.pdf" }} detail={<List.Item.Detail markdown={`![](${SAMPLE_IMAGE})`} />} />
      </List.Section>
    </List>
  );
}

const EMOJI = ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "🫠", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛"];

export function GridDemo() {
  return (
    <Grid columns={8} navigationTitle="Search Emoji & Symbols" navigationIcon={tile("emoji-16", "#FFD45C", "#F5A623")} searchBarPlaceholder="Search Emoji & Symbols…" searchBarAccessory={
      <Grid.Dropdown tooltip="Category">
        <Grid.Dropdown.Item title="All Categories" value="all" icon="app-window-grid-3x3-16" />
        <Grid.Dropdown.Item title="Smileys & People" value="smileys" />
      </Grid.Dropdown>
    }>
      <Grid.Section title="Frequently Used" subtitle="16">
        {EMOJI.slice(0, 16).map((e, i) => (
          <Grid.Item key={i} content={e} keywords={["face"]} actions={<ActionPanel><Action title="Paste to Safari" onAction={() => showToast({ title: `Pasted ${e}` })} /><Action.CopyToClipboard content={e} /></ActionPanel>} />
        ))}
      </Grid.Section>
      <Grid.Section title="Smileys & People" subtitle="559">
        {EMOJI.map((e, i) => (
          <Grid.Item key={`s${i}`} content={e} actions={<ActionPanel><Action title="Paste to Safari" onAction={() => showToast({ title: `Pasted ${e}` })} /></ActionPanel>} />
        ))}
      </Grid.Section>
    </Grid>
  );
}

export function DetailDemo() {
  return (
    <Detail
      navigationTitle="Release Notes"
      navigationIcon={tile("book-16", "#5AB8FF", "#2D7FF0")}
      markdown={"# OpenCast 0.1\n\nThe first public build. **Bring your own AI keys**, self-host your sync.\n\n## Highlights\n\n- Glass launcher with floating footer pills\n- Raycast-compatible extensions\n- `⌘K` action panel everywhere\n\n| Area | Status |\n|---|---|\n| Launcher | Ready |\n| Sync | Beta |\n\n```ts\nimport { List } from \"@raycast/api\";\n```\n\n> Everything that used to be Pro is free."}
      metadata={
        <Metadata>
          <Metadata.Label title="Version" text="0.1.0" />
          <Metadata.Label title="Released" text="October 13, 2026" icon="calendar-16" />
          <Metadata.TagList title="Platforms">
            <Metadata.TagList.Item text="macOS 26" color="raycast-blue" />
            <Metadata.TagList.Item text="macOS 27" color="raycast-purple" />
          </Metadata.TagList>
          <Metadata.Separator />
          <Metadata.Link title="Changelog" text="opencast.app/changelog" target="https://opencast.app/changelog" />
        </Metadata>
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser url="https://opencast.app" />
          <Action.CopyToClipboard title="Copy Version" content="0.1.0" />
        </ActionPanel>
      }
    />
  );
}

export function FormDemo() {
  const [titleError, setTitleError] = useState<string | undefined>();
  return (
    <Form
      navigationTitle="Create Snippet"
      navigationIcon={tile("snippets-16", "#5AB8FF", "#2D7FF0")}
      searchBarAccessory={<Form.LinkAccessory text="Snippets Guide" target="https://opencast.app/docs/snippets" />}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Snippet"
            onSubmit={(values) => {
              if (!String(values.name ?? "").trim()) {
                setTitleError("Name is required");
                return;
              }
              showToast({ title: "Snippet saved", message: String(values.name) });
            }}
          />
          <Action title="Discard Draft" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" placeholder="Snippet name" error={titleError} onChange={() => setTitleError(undefined)} info="Shown in search results" />
      <Form.TextArea id="text" title="Snippet" placeholder="Find your inner Shakespeare…" />
      <Form.TextField id="keyword" title="Keyword" placeholder="Keyword" />
      <Form.TagPicker id="tags" title="Tags" placeholder="Tags">
        <Form.TagPicker.Item value="work" title="work" icon={{ source: "circle-filled-16", tintColor: "raycast-blue" }} />
        <Form.TagPicker.Item value="email" title="email" icon={{ source: "circle-filled-16", tintColor: "raycast-green" }} />
      </Form.TagPicker>
      <Form.Separator />
      <Form.Dropdown id="app" title="Application" defaultValue="all">
        <Form.Dropdown.Item value="all" title="All Applications" icon="app-window-16" />
        <Form.Dropdown.Item value="mail" title="Mail" icon="envelope-16" />
      </Form.Dropdown>
      <Form.DatePicker id="expires" title="Expires" type="date" />
      <Form.Checkbox id="pin" title="Options" label="Pin to top" defaultValue />
      <Form.FilePicker id="files" title="Attachments" />
      <Form.Description title="Tip" text="Use {clipboard} or {date} for dynamic content." />
    </Form>
  );
}

const LARGE = Array.from({ length: 2000 }, (_, i) => ({ id: `row-${i}`, title: `Item ${i + 1}`, subtitle: `Section ${Math.floor(i / 100) + 1}` }));

/** 2,000 rows in 20 sections: windowing and keyboard performance. */
export function LargeListDemo() {
  return (
    <List searchBarPlaceholder="Filter 2,000 rows…" navigationTitle="Large List">
      {Array.from({ length: 20 }, (_, s) => (
        <List.Section key={s} title={`Section ${s + 1}`} subtitle="100">
          {LARGE.slice(s * 100, s * 100 + 100).map((row) => (
            <List.Item key={row.id} id={row.id} title={row.title} subtitle={row.subtitle} icon="blank-document-16" accessories={[{ text: "Command" }]} actions={itemActions(row.title)} />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

export function EmptyDemo() {
  return (
    <List navigationTitle="Search Snippets" navigationIcon={tile("snippets-16", "#5AB8FF", "#2D7FF0")} searchBarPlaceholder="Search snippets…">
      <List.EmptyView
        title="No Snippets Found"
        description={"Write faster by storing and inserting frequently used text.\nCreate your first snippet to get started."}
        actions={
          <ActionPanel>
            <Action title="Create Snippet" icon="plus-16" onAction={() => showToast({ title: "Create Snippet" })} />
          </ActionPanel>
        }
      />
    </List>
  );
}

export function ToastDemo() {
  useEffect(() => {
    const handle = showToast({ style: "animated", title: "Uploading", message: "3 files" });
    const timer = setTimeout(() => handle.update({ style: "success", title: "Uploaded", message: "3 files" }), 1200);
    return () => clearTimeout(timer);
  }, []);
  return <ListDemo />;
}

export function FailureToastDemo() {
  useEffect(() => {
    showToast({ style: "failure", title: "Failed to fetch", message: "Network unreachable", primaryAction: { title: "Retry", shortcut: sc("cmd", "r"), onAction: () => undefined } });
  }, []);
  return <ListDemo />;
}
