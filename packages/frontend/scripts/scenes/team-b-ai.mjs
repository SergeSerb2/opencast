/** Screenshot scenes for AI commands and presets (team B, group "ai"). */
const openCommands = [{ type: "search ai commands" }, { press: "Enter", wait: 700 }];
const openPresets = [{ type: "manage presets" }, { press: "Enter", wait: 700 }];
const openCreate = [{ type: "create ai command" }, { press: "Enter", wait: 700 }];

export default [
  { name: "b-ai-commands", url: "main.html", steps: openCommands },
  { name: "b-ai-commands-args", url: "main.html", steps: [...openCommands, { type: "reply" }, { wait: 300 }] },
  { name: "b-ai-commands-tags", url: "main.html", steps: [...openCommands, { click: "button[aria-label='Filter by Tag']", wait: 400 }] },
  { name: "b-ai-commands-actions", url: "main.html", steps: [...openCommands, { press: "ArrowDown" }, { press: "Meta+k", wait: 400 }] },
  { name: "b-ai-commands-builtin-actions", url: "main.html", steps: [...openCommands, { type: "improve" }, { press: "Meta+k", wait: 400 }] },
  { name: "b-ai-commands-empty", url: "main.html", steps: [...openCommands, { type: "zzzz" }, { wait: 300 }] },
  { name: "b-ai-commands-light", url: "main.html?appearance=light", steps: openCommands },
  { name: "b-ai-editor", url: "main.html", steps: openCreate },
  { name: "b-ai-editor-errors", url: "main.html", steps: [...openCreate, { type: "Answer this question: " }, { type: "{", wait: 300 }, { type: "argu" }, { press: "Enter", wait: 200 }, { press: "Meta+Enter", wait: 400 }] },
  { name: "b-ai-editor-placeholders", url: "main.html", steps: [...openCreate, { type: "Rewrite this text: {", wait: 400 }] },
  { name: "b-ai-editor-light", url: "main.html?appearance=light", steps: [...openCommands, { press: "Meta+e", wait: 600 }] },
  { name: "b-ai-editor-edit", url: "main.html", steps: [...openCommands, { press: "Meta+e", wait: 600 }] },
  { name: "b-ai-editor-icons", url: "main.html", steps: [...openCommands, { press: "Meta+e", wait: 600 }, { click: "button[aria-label='Icon']", wait: 400 }] },
  { name: "b-ai-import", url: "main.html", steps: [{ type: "import ai commands" }, { press: "Enter", wait: 700 }] },
  { name: "b-ai-import-errors", url: "main.html", steps: [{ type: "import ai commands" }, { press: "Enter", wait: 700 }, { press: "Tab" }, { type: "{ not json" }, { press: "Meta+Enter", wait: 400 }] },
  { name: "b-ai-export", url: "main.html", steps: [{ type: "export ai commands" }, { press: "Enter", wait: 800 }] },
  { name: "b-ai-commands-delete", url: "main.html", steps: [...openCommands, { press: "Control+x", wait: 400 }] },
  {
    name: "b-ai-flow-create",
    url: "main.html",
    steps: [...openCommands, { press: "Meta+n", wait: 600 }, { type: "Summarize " }, { type: "{", wait: 300 }, { type: "clip" }, { press: "Enter", wait: 200 }, { click: "#ai-command-name" }, { type: "Summarize Clipboard" }, { press: "Meta+Enter", wait: 800 }],
  },
  { name: "b-ai-presets", url: "main.html", steps: openPresets },
  { name: "b-ai-presets-light", url: "main.html?appearance=light", steps: [...openPresets, { press: "ArrowDown" }, { press: "ArrowDown" }, { wait: 200 }] },
  { name: "b-ai-presets-actions", url: "main.html", steps: [...openPresets, { press: "Meta+k", wait: 400 }] },
  { name: "b-ai-preset-editor", url: "main.html", steps: [...openPresets, { press: "Meta+e", wait: 600 }] },
  { name: "b-ai-preset-tools", url: "main.html", steps: [...openPresets, { press: "ArrowDown" }, { press: "ArrowDown" }, { press: "Meta+e", wait: 600 }, { click: "input[aria-label='Tools']", wait: 400 }] },
  { name: "b-ai-preset-create", url: "main.html", steps: [{ type: "create preset" }, { press: "Enter", wait: 700 }] },
];
