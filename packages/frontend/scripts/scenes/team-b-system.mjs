/**
 * Screenshot scenes for the Team B "system" views: custom window commands,
 * Search Menu Bar Items, My Schedule and Kill Process.
 */
const open = (query, wait = 700) => [{ type: query, wait: 450 }, { press: "Enter", wait }];

export default [
  // Window management
  { name: "b-sys-wm-editor", url: "main.html", steps: [...open("create window management"), { type: "Centered Focus" }, { wait: 150 }] },
  {
    name: "b-sys-wm-editor-error",
    url: "main.html",
    steps: [...open("create window management"), { click: "#sc-wm-x" }, { type: "45" }, { press: "Meta+Enter", wait: 400 }],
  },
  { name: "b-sys-wm-icon-picker", url: "main.html", steps: [...open("create window management"), { click: ".sc-wm-icon-picker", wait: 350 }] },
  { name: "b-sys-wm-list", url: "main.html", steps: open("search window commands") },
  { name: "b-sys-wm-list-actions", url: "main.html", steps: [...open("search window commands"), { press: "Meta+k", wait: 350 }] },
  { name: "b-sys-wm-list-light", url: "main.html?appearance=light", steps: open("search window commands") },
  { name: "b-sys-wm-edit", url: "main.html", steps: [...open("search window commands"), { press: "ArrowDown" }, { press: "ArrowDown" }, { press: "Meta+e", wait: 500 }] },
  { name: "b-sys-wm-delete-confirm", url: "main.html", steps: [...open("search window commands"), { press: "Control+x", wait: 350 }] },
  {
    name: "b-sys-wm-list-empty",
    url: "main.html",
    steps: [...open("search window commands"), ...Array.from({ length: 5 }, () => [{ press: "Control+x", wait: 250 }, { press: "Enter", wait: 350 }]).flat()],
  },

  // Search Menu Bar Items
  { name: "b-sys-menus", url: "main.html", steps: open("search menu bar") },
  { name: "b-sys-menus-search", url: "main.html", steps: [...open("search menu bar"), { type: "find", wait: 300 }] },
  { name: "b-sys-menus-actions", url: "main.html", steps: [...open("search menu bar"), { press: "ArrowDown" }, { press: "Meta+k", wait: 350 }] },
  { name: "b-sys-menus-empty", url: "main.html", steps: [...open("search menu bar"), { type: "zzzz", wait: 300 }] },

  // My Schedule
  { name: "b-sys-calendar", url: "main.html", steps: open("my schedule", 900) },
  { name: "b-sys-calendar-list", url: "main.html", steps: [...open("my schedule", 900), { press: "Meta+i", wait: 300 }] },
  { name: "b-sys-calendar-later", url: "main.html", steps: [...open("my schedule", 900), { press: "Meta+i", wait: 200 }, ...Array.from({ length: 9 }, () => ({ press: "ArrowDown", wait: 40 })), { wait: 300 }] },
  { name: "b-sys-calendar-actions", url: "main.html", steps: [...open("my schedule", 900), { press: "Meta+k", wait: 350 }] },
  { name: "b-sys-calendar-dropdown", url: "main.html", steps: [...open("my schedule", 900), { click: ".sc-dropdown[data-variant=nav]", wait: 350 }] },
  { name: "b-sys-calendar-empty", url: "main.html", steps: [...open("my schedule", 900), { type: "no such event", wait: 300 }] },
  { name: "b-sys-calendar-light", url: "main.html?appearance=light", steps: open("my schedule", 900) },

  // Kill Process
  { name: "b-sys-processes", url: "main.html", steps: open("kill process") },
  { name: "b-sys-processes-actions", url: "main.html", steps: [...open("kill process"), { press: "Meta+k", wait: 350 }] },
  { name: "b-sys-processes-dropdown", url: "main.html", steps: [...open("kill process"), { click: ".sc-dropdown[data-variant=nav]", wait: 350 }] },
  { name: "b-sys-processes-confirm", url: "main.html", steps: [...open("kill process"), { press: "Alt+Meta+q", wait: 350 }] },
  { name: "b-sys-processes-killed", url: "main.html", steps: [...open("kill process"), { press: "Enter", wait: 500 }] },
  { name: "b-sys-processes-failure", url: "main.html", steps: [...open("kill process"), { type: "windowserver", wait: 300 }, { press: "Enter", wait: 500 }] },
];
