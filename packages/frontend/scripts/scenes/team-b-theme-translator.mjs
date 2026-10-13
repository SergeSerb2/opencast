/** Screenshot scenes for Theme Studio / Switch Theme and Translator (team B, group "tt"). */
const openSwitch = [{ type: "switch theme", wait: 300 }, { press: "Enter", wait: 800 }];
const openStudio = [{ type: "show theme studio", wait: 300 }, { press: "Enter", wait: 800 }];
const down = (n) => Array.from({ length: n }, () => ({ press: "ArrowDown", wait: 60 }));
const openTranslate = (text) => [{ type: "translate", wait: 300 }, { press: "Tab" }, { type: text }, { press: "Enter", wait: 300 }];
const SPANISH = "¿Dónde está la estación de tren más cercana?";
const LONG = "Good morning! The design review moved to 3 pm. Could you send me the latest mockups before then?";

export default [
  { name: "b-tt-switch", url: "main.html", steps: openSwitch },
  { name: "b-tt-switch-preview", url: "main.html", steps: [...openSwitch, ...down(6), { wait: 400 }] },
  { name: "b-tt-switch-preview-dark", url: "main.html", steps: [...openSwitch, ...down(3), { wait: 400 }] },
  { name: "b-tt-switch-actions", url: "main.html", steps: [...openSwitch, ...down(4), { press: "Meta+k", wait: 400 }] },
  { name: "b-tt-switch-filter", url: "main.html", steps: [...openSwitch, { click: "button[aria-label='Filter by Appearance']", wait: 400 }] },
  { name: "b-tt-switch-search", url: "main.html", steps: [...openSwitch, { type: "zzz", wait: 300 }] },
  { name: "b-tt-switch-light", url: "main.html?appearance=light", steps: openSwitch },
  { name: "b-tt-editor", url: "main.html", steps: [...openSwitch, ...down(4), { press: "Meta+e", wait: 700 }] },
  { name: "b-tt-editor-copy", url: "main.html", steps: [...openSwitch, ...down(1), { press: "Meta+e", wait: 700 }] },
  { name: "b-tt-editor-loader", url: "main.html", steps: [...openSwitch, ...down(4), { press: "Meta+e", wait: 700 }, { click: "label:has-text('Loader')", wait: 600 }] },
  {
    name: "b-tt-editor-errors",
    url: "main.html",
    steps: [...openSwitch, ...down(4), { press: "Meta+e", wait: 700 }, { press: "Meta+a" }, { press: "Backspace" }, { press: "Tab" }, { press: "Tab" }, { press: "Tab" }, { press: "Meta+a" }, { type: "#12G4" }, { press: "Meta+Enter", wait: 400 }],
  },
  { name: "b-tt-editor-actions", url: "main.html", steps: [...openSwitch, ...down(4), { press: "Meta+e", wait: 700 }, { press: "Meta+k", wait: 400 }] },
  { name: "b-tt-editor-light", url: "main.html?appearance=light", steps: [...openSwitch, ...down(9), { press: "Meta+e", wait: 700 }] },
  { name: "b-tt-studio", url: "main.html", steps: openStudio },
  { name: "b-tt-translator-empty", url: "main.html", steps: [{ type: "translate to spanish", wait: 300 }, { press: "Enter", wait: 600 }] },
  { name: "b-tt-translator-streaming", url: "main.html", steps: [...openTranslate(SPANISH), { wait: 420 }] },
  { name: "b-tt-translator", url: "main.html", steps: [...openTranslate(SPANISH), { wait: 2000 }] },
  { name: "b-tt-translator-long", url: "main.html?set.translator.defaultTargetLanguage=%22de%22", steps: [...openTranslate(LONG), { wait: 3000 }] },
  { name: "b-tt-translator-actions", url: "main.html", steps: [...openTranslate(SPANISH), { wait: 2000 }, { press: "Meta+k", wait: 400 }] },
  { name: "b-tt-translator-languages", url: "main.html", steps: [...openTranslate(SPANISH), { wait: 2000 }, { press: "Meta+p", wait: 400 }] },
  { name: "b-tt-translator-byok", url: "main.html?mockAi=none", steps: [{ type: "translate to spanish", wait: 300 }, { press: "Enter", wait: 800 }] },
  { name: "b-tt-translator-light", url: "main.html?appearance=light", steps: [...openTranslate(SPANISH), { wait: 2000 }] },
];
