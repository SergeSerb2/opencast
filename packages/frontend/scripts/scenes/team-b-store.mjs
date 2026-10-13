/**
 * Screenshot scenes for the Team B "store" views: Store (list, categories,
 * detail, install), Manage Extensions (list, commands, update results).
 */
const open = (query, wait = 900) => [
  { type: query, wait: 650 },
  { press: "Enter", wait },
];
const store = (wait) => open("store", wait);
const extensions = (wait) => open("extensions", wait);
const category = (name) => [
  { click: ".sc-view[data-active] .sc-dropdown", wait: 300 },
  { type: name, wait: 200 },
  { press: "Enter", wait: 700 },
];

export default [
  // Store
  { name: "b-store-list", url: "main.html", steps: store() },
  { name: "b-store-category-menu", url: "main.html", steps: [...store(), { click: ".sc-view[data-active] .sc-dropdown", wait: 400 }] },
  { name: "b-store-category", url: "main.html", steps: [...store(), ...category("developer")] },
  { name: "b-store-installed", url: "main.html", steps: [...store(), ...category("installed")] },
  { name: "b-store-actions", url: "main.html", steps: [...store(), { press: "Meta+k", wait: 400 }] },
  { name: "b-store-empty", url: "main.html", steps: [...store(), { type: "zzqx", wait: 900 }] },
  { name: "b-store-detail", url: "main.html", steps: [...store(), { press: "Enter", wait: 900 }] },
  { name: "b-store-detail-readme", url: "main.html", steps: [...store(), { press: "Enter", wait: 900 }, { press: "PageDown", wait: 400 }, { press: "PageDown", wait: 600 }] },
  {
    name: "b-store-detail-actions",
    url: "main.html",
    steps: [...store(), { press: "ArrowDown", wait: 100 }, { press: "ArrowDown", wait: 100 }, { press: "Enter", wait: 900 }, { press: "Meta+k", wait: 400 }],
  },
  { name: "b-store-screenshot", url: "main.html", steps: [...store(), { press: "Enter", wait: 900 }, { click: ".sc-view[data-active] .sc-store-detail__shot", wait: 500 }] },
  { name: "b-store-installing", url: "main.html", steps: [...store(), { press: "ArrowDown", wait: 100 }, { press: "ArrowDown", wait: 100 }, { press: "Meta+Enter", wait: 450 }] },
  { name: "b-store-install-done", url: "main.html", steps: [...store(), { press: "ArrowDown", wait: 100 }, { press: "ArrowDown", wait: 100 }, { press: "Meta+Enter", wait: 2600 }] },
  { name: "b-store-light", url: "main.html?appearance=light", steps: store() },
  { name: "b-store-detail-light", url: "main.html?appearance=light", steps: [...store(), { press: "Enter", wait: 900 }] },

  // Manage Extensions
  { name: "b-store-extensions", url: "main.html", steps: extensions() },
  { name: "b-store-extensions-actions", url: "main.html", steps: [...extensions(), { press: "Meta+k", wait: 400 }] },
  { name: "b-store-extensions-commands", url: "main.html", steps: [...extensions(), { press: "ArrowDown", wait: 100 }, { press: "Enter", wait: 700 }] },
  { name: "b-store-extensions-commands-actions", url: "main.html", steps: [...extensions(), { press: "ArrowDown", wait: 100 }, { press: "Enter", wait: 700 }, { press: "Meta+k", wait: 400 }] },
  { name: "b-store-extensions-uninstall", url: "main.html", steps: [...extensions(), { press: "ArrowDown", wait: 100 }, { press: "Control+x", wait: 500 }] },
  { name: "b-store-extensions-updates", url: "main.html", steps: [...extensions(), { press: "Meta+u", wait: 3600 }] },
  { name: "b-store-extensions-empty", url: "main.html", steps: [...extensions(), { type: "zzqx", wait: 500 }] },
];
