<img src="assets/icon.svg" width="88" height="88" alt="OpenCast logo">

# OpenCast

**A small command window for the things you do all day.**

OpenCast is an open-source macOS launcher inspired by Raycast. Press **⌥Space**,
type what you need, and get back to work. Apps, notes, clipboard history, window
controls, and AI share the same keyboard-first home.

I’m building it around a simple idea: you should be able to open your everyday
tools, read their source, and make them your own. Use the AI provider you like.
Run sync on your own server. Change the bits that get in your way.

This is an early project. There are rough edges, and a good bug report is very
welcome.

## Try it

**[Download the latest OpenCast DMG](https://github.com/SergeSerb2/opencast/releases/latest)**

The download is for **Apple silicon Macs running macOS 14 or later**. Open the
DMG, drag **OpenCast.app** to **Applications**, then launch it. Node is bundled;
you don’t need developer tools to use the app.

These first builds are ad-hoc signed and are not notarized. If macOS blocks the
app, follow [Apple’s Open Anyway instructions](https://support.apple.com/guide/mac-help/mh40616/mac).

Press **⌥Space** to bring up the launcher. Allow **Accessibility** when prompted
to use window controls, snippet expansion, and pasting into other apps.

## What’s inside

- **A place to start.** Search apps, files, commands, and quicklinks. Add aliases,
  hotkeys, and favorites for the things you reach for often.
- **The useful little tools.** Clipboard history, text snippets, floating Markdown
  notes, a calculator, emoji search, translation, and custom window layouts.
- **AI on your terms.** Ask a quick question from search, open a longer chat, or
  save a prompt as a command. Connect your own provider or a local model.
- **Room to extend it.** Run Raycast extensions and your own script commands.
  Import snippets, quicklinks, notes, and AI commands from a Raycast export.
- **Sync you can host.** A small Cloudflare Worker and D1 database carry your
  encrypted vault between Macs. The app encrypts the data before it leaves your
  machine.

There’s more in the command list: calendars, menu search, system actions, theme
controls, and a bit of confetti. The launcher is the best way to explore it.

## Make it yours

For AI, open **Settings → AI → Models & Providers**. Add your provider and choose
the models you want to use. API keys stay in your Mac’s Keychain and can optionally sync end-to-end encrypted. OpenAI,
Anthropic, Gemini, OpenRouter, and local tools such as Ollama and LM Studio are
supported. An OpenAI-compatible proxy such as
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) works too.

For sync, follow the [Cloud Sync guide](docs/SYNC.md). You deploy the Worker to
your Cloudflare account, then connect each Mac with the server URL, token, and
the same encryption passphrase.

## Build it yourself

You’ll need macOS 14+, Xcode 16+ with Swift 6, Node 22.13+, and pnpm 10.

```sh
git clone https://github.com/SergeSerb2/opencast.git
cd opencast
pnpm install --frozen-lockfile
./scripts/build-app.sh --bundle-node --open
```

The app lands in `build/OpenCast.app`. To make a DMG instead:

```sh
./scripts/build-dmg.sh
```

For UI work, `./scripts/dev.sh --mock` runs the browser development setup with
sample data. `./scripts/dev.sh` runs the frontend with the local backend.

The Mac app is a Swift/AppKit host, with React views in WebKit and a Node backend.
The main pieces live in:

```text
apps/macos            Native windows and macOS services
packages/frontend     Launcher, chat, notes, and settings
packages/backend      Commands, data, AI, and sync
packages/raycast-api   Extension runtime
packages/sync-worker   Self-hosted sync server
packages/protocol      Shared contracts
```

## Help shape it

If something breaks, [open an issue](https://github.com/SergeSerb2/opencast/issues/new)
with your macOS version, what you tried, and what you expected to happen. Small,
focused pull requests are welcome too.

Useful reading: [architecture](docs/ARCHITECTURE.md),
[extensions](docs/EXTENSIONS.md), [extension UI](docs/EXTENSION-UI.md), and
[Mac releases](docs/RELEASES.md).

## License

MIT. See [LICENSE](LICENSE). Inter and JetBrains Mono use the SIL Open Font
License; Lucide icons use the ISC license.

OpenCast is an independent project and is not affiliated with Raycast
Technologies Ltd. Raycast is a trademark of its owner.
