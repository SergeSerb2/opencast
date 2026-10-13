import type { BackendEvents, ExtensionSessionState, HandlerRef, UINode } from "@surgecast/protocol";
import type { Emitter } from "../emitter";
import { SAMPLE_IMAGE } from "./fixtures/content";

type Handler = (...args: unknown[]) => void;

/**
 * In-browser stand-in for the extension runtime: builds UINode trees for a few
 * sample commands and reacts to `ext.session.dispatch` like the real runtime.
 */
export class MockSession {
  private handlers = new Map<string, Handler>();
  private stack: (() => UINode)[] = [];
  private nextHandler = 0;
  private nextNode = 0;
  private isLoading = false;
  readonly state: { query: string; filter: string; formError?: string; values: Record<string, unknown> } = { query: "", filter: "open", values: {} };

  constructor(
    readonly sessionId: string,
    readonly extensionName: string,
    readonly commandName: string,
    private readonly events: Emitter<BackendEvents>,
    private readonly onClose: (id: string) => void,
  ) {}

  start(): void {
    const build = BUILDERS[`${this.extensionName}.${this.commandName}`];
    if (!build) throw new Error(`No mock for ${this.extensionName}.${this.commandName}`);
    this.isLoading = true;
    this.stack = [() => build(this)];
    this.emit();
    setTimeout(() => {
      this.isLoading = false;
      this.emit();
    }, 350);
  }

  handler(fn: Handler): HandlerRef {
    const id = `h${++this.nextHandler}`;
    this.handlers.set(id, fn);
    return { $handler: id };
  }

  node(type: string, props: Record<string, unknown> = {}, children: UINode[] = []): UINode {
    const id = typeof props.id === "string" ? `${type}:${props.id}` : `${type}#${++this.nextNode}`;
    return { type, id, props, children };
  }

  dispatch(handlerId: string, args: unknown[]): void {
    const fn = this.handlers.get(handlerId);
    if (!fn) throw new Error(`Unknown handler ${handlerId}`);
    fn(...args);
  }

  push(build: () => UINode): void {
    this.stack.push(build);
    this.emit();
  }

  pop(): boolean {
    if (this.stack.length <= 1) {
      this.close("user");
      return true;
    }
    this.stack.pop();
    this.emit();
    return false;
  }

  close(reason: BackendEvents["ext.session.closed"]["reason"]): void {
    this.events.emit("ext.session.closed", { sessionId: this.sessionId, reason });
    this.onClose(this.sessionId);
  }

  toast(style: "success" | "failure" | "animated", title: string, message?: string): void {
    this.events.emit("ext.toast", { sessionId: this.sessionId, toast: { id: `t${Date.now()}`, style, title, message } });
  }

  emit(): void {
    this.handlers.clear();
    this.nextNode = 0;
    const top = this.stack[this.stack.length - 1];
    const root = top();
    const state: ExtensionSessionState = {
      sessionId: this.sessionId,
      extensionName: this.extensionName,
      commandName: this.commandName,
      mode: "view",
      root,
      depth: this.stack.length,
      isLoading: this.isLoading,
      navigationTitle: typeof root.props.navigationTitle === "string" ? root.props.navigationTitle : undefined,
    };
    this.events.emit("ext.session.updated", state);
  }
}

const ago = (minutes: number) => ({ $date: new Date(Date.now() - minutes * 60_000).toISOString() });

function prActions(s: MockSession, pr: { title: string; url: string; number: number }): UINode {
  return s.node("ActionPanel", { title: `#${pr.number}` }, [
    s.node("ActionPanel.Section", {}, [
      s.node("Action.OpenInBrowser", { url: pr.url, onAction: s.handler(() => s.toast("success", "Opened in Browser")) }),
      s.node("Action.Push", {
        title: "Show Details",
        icon: "sidebar-16",
        shortcut: { modifiers: ["cmd"], key: "d" },
        onAction: s.handler(() => s.push(() => readmeDetail(s, pr.title))),
      }),
    ]),
    s.node("ActionPanel.Section", { title: "Copy" }, [
      s.node("Action.CopyToClipboard", { title: "Copy URL", content: pr.url, shortcut: { modifiers: ["cmd", "shift"], key: "c" }, onAction: s.handler(() => s.toast("success", "Copied URL")) }),
      s.node("Action.CopyToClipboard", { title: "Copy Number", content: String(pr.number), shortcut: { modifiers: ["cmd", "opt"], key: "c" }, onAction: s.handler(() => undefined) }),
    ]),
    s.node("ActionPanel.Section", {}, [
      s.node("Action", { title: "Close Pull Request", icon: "xmark-circle-16", style: "destructive", shortcut: { modifiers: ["ctrl"], key: "x" }, onAction: s.handler(() => s.toast("failure", "Not allowed", "You need write access")) }),
    ]),
  ]);
}

const PRS = [
  { number: 128, title: "Glass footer pills and action panel", repo: "surgecast/surgecast", author: "mira", comments: 12, updated: 14, labels: ["design", "frontend"], state: "open", section: "review" },
  { number: 131, title: "E2E encrypted sync worker", repo: "surgecast/sync-worker", author: "dev", comments: 4, updated: 55, labels: ["sync"], state: "open", section: "review" },
  { number: 119, title: "Calculator: time zones and units", repo: "surgecast/surgecast", author: "me", comments: 7, updated: 60 * 26, labels: ["backend"], state: "open", section: "mine" },
  { number: 102, title: "Extension runtime: Form drafts", repo: "surgecast/raycast-api", author: "me", comments: 0, updated: 60 * 24 * 3, labels: ["runtime"], state: "merged", section: "mine" },
  { number: 97, title: "Notes window: floating mode", repo: "surgecast/surgecast", author: "me", comments: 21, updated: 60 * 24 * 9, labels: ["notes"], state: "merged", section: "mine" },
];

function pullRequests(s: MockSession): UINode {
  const visible = PRS.filter((pr) => s.state.filter === "all" || pr.state === s.state.filter);
  const item = (pr: (typeof PRS)[number]) =>
    s.node(
      "List.Item",
      {
        id: `pr-${pr.number}`,
        title: pr.title,
        subtitle: `#${pr.number}`,
        icon: { source: pr.state === "merged" ? "check-circle-16" : "circle-progress-50-16", tintColor: pr.state === "merged" ? "raycast-purple" : "raycast-green" },
        keywords: [pr.repo, pr.author],
        accessories: [{ text: String(pr.comments), icon: "speech-bubble-16" }, { date: ago(pr.updated) }],
        detail: s.node("List.Item.Detail", {
          markdown: `## ${pr.title}\n\nThis pull request updates **${pr.repo}**.\n\n- Adds tests\n- Updates docs\n\n\`\`\`ts\nexport const answer = 42;\n\`\`\``,
          metadata: s.node("List.Item.Detail.Metadata", {}, [
            s.node("List.Item.Detail.Metadata.Label", { title: "Repository", text: pr.repo, icon: "code-block-16" }),
            s.node("List.Item.Detail.Metadata.Label", { title: "Author", text: pr.author, icon: "person-16" }),
            s.node("List.Item.Detail.Metadata.TagList", { title: "Labels" }, pr.labels.map((l, i) => s.node("List.Item.Detail.Metadata.TagList.Item", { text: l, color: i === 0 ? "raycast-purple" : "raycast-blue" }))),
            s.node("List.Item.Detail.Metadata.Separator"),
            s.node("List.Item.Detail.Metadata.Label", { title: "Comments", text: String(pr.comments) }),
            s.node("List.Item.Detail.Metadata.Link", { title: "URL", text: `github.com/${pr.repo}/pull/${pr.number}`, target: `https://github.com/${pr.repo}/pull/${pr.number}` }),
          ]),
        }),
        actions: prActions(s, { title: pr.title, url: `https://github.com/${pr.repo}/pull/${pr.number}`, number: pr.number }),
      },
    );
  return s.node(
    "List",
    {
      isShowingDetail: true,
      searchBarPlaceholder: "Search pull requests…",
      navigationTitle: "My Pull Requests",
      onSelectionChange: s.handler(() => undefined),
      searchBarAccessory: s.node(
        "List.Dropdown",
        { tooltip: "Filter", value: s.state.filter, onChange: s.handler((value) => {
          s.state.filter = String(value);
          s.emit();
        }) },
        [s.node("List.Dropdown.Item", { title: "Open", value: "open", icon: "circle-16" }), s.node("List.Dropdown.Item", { title: "Merged", value: "merged", icon: "check-circle-16" }), s.node("List.Dropdown.Item", { title: "All", value: "all", icon: "list-16" })],
      ),
    },
    [
      s.node("List.Section", { title: "Review Requested", subtitle: String(visible.filter((p) => p.section === "review").length) }, visible.filter((p) => p.section === "review").map(item)),
      s.node("List.Section", { title: "Created by Me" }, visible.filter((p) => p.section === "mine").map(item)),
      s.node("List.EmptyView", { title: "No Pull Requests", description: "Nothing matches this filter.", icon: "check-circle-16" }),
    ],
  );
}

function readmeDetail(s: MockSession, title = "surgecast/surgecast"): UINode {
  return s.node("Detail", {
    navigationTitle: "Repository Readme",
    markdown: `# ${title}\n\nAn open-source launcher for macOS. **Bring your own AI keys**, self-host your sync.\n\n## Features\n\n- Root search with calculator, quicklinks and snippets\n- Raycast-compatible extensions\n- [Documentation](https://surgecast.app/docs)\n\n| Area | Status |\n|---|---|\n| Launcher | ✅ |\n| Sync | 🚧 |\n\n\`\`\`bash\npnpm install && pnpm dev\n\`\`\`\n\n![Screenshot](${SAMPLE_IMAGE})`,
    metadata: s.node("Detail.Metadata", {}, [
      s.node("Detail.Metadata.Label", { title: "Stars", text: "4,210", icon: "star-16" }),
      s.node("Detail.Metadata.Label", { title: "Language", text: "TypeScript" }),
      s.node("Detail.Metadata.TagList", { title: "Topics" }, [s.node("Detail.Metadata.TagList.Item", { text: "launcher", color: "raycast-orange" }), s.node("Detail.Metadata.TagList.Item", { text: "macos" })]),
      s.node("Detail.Metadata.Separator"),
      s.node("Detail.Metadata.Link", { title: "Homepage", text: "surgecast.app", target: "https://surgecast.app" }),
    ]),
    actions: s.node("ActionPanel", {}, [
      s.node("Action.OpenInBrowser", { url: "https://github.com/surgecast/surgecast", onAction: s.handler(() => undefined) }),
      s.node("Action.CopyToClipboard", { title: "Copy Clone URL", content: "git@github.com:surgecast/surgecast.git", onAction: s.handler(() => undefined) }),
    ]),
  });
}

function createIssue(s: MockSession): UINode {
  return s.node(
    "Form",
    {
      navigationTitle: "Create Issue",
      searchBarAccessory: s.node("Form.LinkAccessory", { text: "Issue Guide", target: "https://docs.github.com/issues" }),
      actions: s.node("ActionPanel", {}, [
        s.node("Action.SubmitForm", {
          title: "Create Issue",
          onAction: s.handler((arg) => {
            const values = ((arg as { formValues?: Record<string, unknown> })?.formValues ?? {}) as Record<string, unknown>;
            if (!String(values.title ?? "").trim()) {
              s.state.formError = "Title is required";
              s.emit();
              s.toast("failure", "Missing title");
              return;
            }
            s.state.formError = undefined;
            s.toast("success", "Issue created", `#${140 + Math.floor(Math.random() * 20)}`);
            s.close("completed");
          }),
        }),
        s.node("Action", { title: "Clear Form", icon: "eraser-16", shortcut: { modifiers: ["cmd", "shift"], key: "backspace" }, onAction: s.handler(() => s.emit()) }),
      ]),
    },
    [
      s.node("Form.Dropdown", { id: "repo", title: "Repository", defaultValue: "surgecast/surgecast" }, [
        s.node("Form.Dropdown.Item", { value: "surgecast/surgecast", title: "surgecast/surgecast", icon: "code-block-16" }),
        s.node("Form.Dropdown.Item", { value: "surgecast/sync-worker", title: "surgecast/sync-worker", icon: "code-block-16" }),
      ]),
      s.node("Form.TextField", { id: "title", title: "Title", placeholder: "Short summary", error: s.state.formError, info: "Shown in notifications and lists", onChange: s.handler(() => {
        if (s.state.formError) {
          s.state.formError = undefined;
          s.emit();
        }
      }) }),
      s.node("Form.TextArea", { id: "body", title: "Description", placeholder: "Steps to reproduce, expected and actual behavior…", enableMarkdown: true }),
      s.node("Form.Separator"),
      s.node("Form.TagPicker", { id: "labels", title: "Labels", defaultValue: ["bug"] }, [
        s.node("Form.TagPicker.Item", { value: "bug", title: "bug", icon: { source: "circle-filled-16", tintColor: "raycast-red" } }),
        s.node("Form.TagPicker.Item", { value: "design", title: "design", icon: { source: "circle-filled-16", tintColor: "raycast-purple" } }),
        s.node("Form.TagPicker.Item", { value: "good-first-issue", title: "good first issue", icon: { source: "circle-filled-16", tintColor: "raycast-green" } }),
      ]),
      s.node("Form.DatePicker", { id: "due", title: "Due Date", type: "date" }),
      s.node("Form.Checkbox", { id: "assign", title: "Assignee", label: "Assign to me", defaultValue: true }),
      s.node("Form.PasswordField", { id: "otp", title: "2FA Code", placeholder: "Optional" }),
      s.node("Form.FilePicker", { id: "attachments", title: "Attachments", allowMultipleSelection: true }),
      s.node("Form.Description", { title: "Note", text: "Issues are created in the selected repository with your account." }),
    ],
  );
}

const PHOTO_COLORS = [
  ["#7b5cff", "#ff6fae"],
  ["#1fb6ff", "#7cf2c4"],
  ["#ff9f43", "#ff5e62"],
  ["#2c3e50", "#4ca1af"],
  ["#f7971e", "#ffd200"],
  ["#00c6ff", "#0072ff"],
  ["#c471f5", "#fa71cd"],
  ["#43e97b", "#38f9d7"],
];

function photo(i: number): string {
  const [a, b] = PHOTO_COLORS[i % PHOTO_COLORS.length];
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/><circle cx="${120 + (i * 53) % 360}" cy="${90 + (i * 37) % 200}" r="${40 + (i % 3) * 20}" fill="#fff" opacity=".35"/></svg>`,
    )
  );
}

function photos(s: MockSession): UINode {
  const names = ["Aurora", "Coast", "Dunes", "Fjord", "Glacier", "Harbor", "Lagoon", "Meadow", "Mesa", "Reef", "Summit", "Valley"];
  const items = names.map((name, i) =>
    s.node("Grid.Item", {
      id: `photo-${i}`,
      content: photo(i),
      title: name,
      subtitle: `${(i + 3) * 117} likes`,
      keywords: ["photo"],
      actions: s.node("ActionPanel", {}, [
        s.node("Action.OpenInBrowser", { title: "Open on Unsplash", url: `https://unsplash.com/s/${name}`, onAction: s.handler(() => undefined) }),
        s.node("Action.CopyToClipboard", { title: "Copy Image URL", content: `https://unsplash.com/${name}`, onAction: s.handler(() => s.toast("success", "Copied")) }),
      ]),
    }),
  );
  return s.node(
    "Grid",
    {
      columns: 4,
      aspectRatio: "3/2",
      fit: "fill",
      inset: "zero",
      navigationTitle: "Search Photos",
      searchBarPlaceholder: "Search photos…",
      searchBarAccessory: s.node("Grid.Dropdown", { tooltip: "Orientation", defaultValue: "any", onChange: s.handler(() => undefined) }, [s.node("Grid.Dropdown.Item", { title: "Any Orientation", value: "any" }), s.node("Grid.Dropdown.Item", { title: "Landscape", value: "landscape" })]),
    },
    [s.node("Grid.Section", { title: "Featured", subtitle: "4" }, items.slice(0, 4)), s.node("Grid.Section", { title: "Latest" }, items.slice(4))],
  );
}

function defineWord(s: MockSession): UINode {
  return s.node("Detail", {
    navigationTitle: "Define Word",
    markdown: "# surge\n\n*noun* · /sɜːdʒ/\n\n1. A sudden powerful forward or upward movement.\n2. A sudden large temporary increase.\n\n> “A surge of interest in open-source launchers.”",
    actions: s.node("ActionPanel", {}, [s.node("Action.CopyToClipboard", { title: "Copy Definition", content: "A sudden powerful forward movement.", onAction: s.handler(() => undefined) })]),
  });
}

const BUILDERS: Record<string, (s: MockSession) => UINode> = {
  "github.my-pull-requests": pullRequests,
  "github.create-issue": createIssue,
  "github.repository-readme": (s) => readmeDetail(s),
  "unsplash.search-photos": photos,
  "dictionary.define-word": defineWord,
};

export function hasMockSession(extension: string, command: string): boolean {
  return `${extension}.${command}` in BUILDERS;
}
