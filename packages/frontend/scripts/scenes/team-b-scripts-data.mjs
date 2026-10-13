/**
 * Screenshot scenes for the Team B "scripts & data" views: Search Script
 * Commands, Create Script Command, script output, Import/Export Data and
 * Check Storage.
 */
const open = (query, wait = 700) => [{ type: query, wait: 450 }, { press: "Enter", wait }];

export default [
  // Search Script Commands
  { name: "b-sd-scripts", url: "main.html", steps: open("search script commands") },
  { name: "b-sd-scripts-actions", url: "main.html", steps: [...open("search script commands"), { press: "Meta+k", wait: 350 }] },
  { name: "b-sd-scripts-arguments", url: "main.html", steps: [...open("search script commands"), { type: "kill", wait: 250 }, { press: "Tab" }, { type: "3000", wait: 200 }] },
  { name: "b-sd-scripts-package", url: "main.html", steps: [...open("search script commands"), { click: ".sc-dropdown[data-variant=nav]", wait: 350 }] },
  { name: "b-sd-scripts-no-match", url: "main.html", steps: [...open("search script commands"), { type: "zzzz", wait: 250 }] },
  { name: "b-sd-scripts-empty", url: "main.html?set.scripts.directories=[]", steps: open("search script commands") },
  { name: "b-sd-scripts-light", url: "main.html?appearance=light", steps: open("search script commands") },

  // Create Script Command
  { name: "b-sd-create", url: "main.html", steps: [...open("create script command"), { type: "Open Pull Request", wait: 200 }] },
  { name: "b-sd-create-error", url: "main.html", steps: [...open("create script command"), { press: "Meta+Enter", wait: 400 }] },
  { name: "b-sd-create-actions", url: "main.html", steps: [...open("create script command"), { press: "Meta+k", wait: 350 }] },

  // Script output (fullOutput)
  { name: "b-sd-output-running", url: "main.html", steps: [...open("update homebrew", 650)] },
  { name: "b-sd-output-done", url: "main.html", steps: [...open("update homebrew", 2400)] },
  { name: "b-sd-output-actions", url: "main.html", steps: [...open("update homebrew", 2400), { press: "Meta+k", wait: 350 }] },
  { name: "b-sd-output-uptime", url: "main.html", steps: open("system uptime", 900) },

  // Import / Export / Storage
  { name: "b-sd-import", url: "main.html", steps: open("import raycast data") },
  {
    name: "b-sd-import-error",
    url: "main.html",
    steps: [...open("import raycast data"), { click: ".sc-file-picker", wait: 200 }, { press: "Meta+Enter", wait: 1100 }],
  },
  {
    name: "b-sd-import-results",
    url: "main.html",
    steps: [...open("import raycast data"), { click: ".sc-file-picker", wait: 200 }, { click: "input[type=password]" }, { type: "correct horse" }, { press: "Meta+Enter", wait: 1300 }],
  },
  { name: "b-sd-import-surgecast", url: "main.html", steps: open("import surgecast data") },
  { name: "b-sd-export", url: "main.html", steps: open("export data") },
  {
    name: "b-sd-export-error",
    url: "main.html",
    steps: [...open("export data"), { click: ".sc-file-picker", wait: 200 }, { click: "input[type=password]" }, { type: "short" }, { press: "Meta+Enter", wait: 400 }],
  },
  { name: "b-sd-storage", url: "main.html", steps: open("check storage") },
  { name: "b-sd-storage-actions", url: "main.html", steps: [...open("check storage"), { press: "Meta+k", wait: 350 }] },
  { name: "b-sd-storage-light", url: "main.html?appearance=light", steps: open("check storage") },
];
