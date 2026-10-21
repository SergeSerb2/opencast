# Contributing to OpenCast

Thanks for helping. Bug reports, small fixes, docs, and extension compatibility
reports are all useful.

## Before you start

- **Bugs:** [open an issue](https://github.com/SergeSerb2/opencast/issues/new/choose)
  with your macOS version, the OpenCast build (Settings → About), what you did, and
  what you expected.
- **Security problems:** don't open a public issue. Follow [SECURITY.md](SECURITY.md).
- **Larger changes:** open an issue first so we can agree on the approach before you
  spend time on it.

## Set up

You need macOS 14+, Xcode 16+ with Swift 6, Node 22.13+ (see `.node-version`), and
pnpm 10.

```sh
git clone https://github.com/SergeSerb2/opencast.git
cd opencast
pnpm install --frozen-lockfile
```

Ways to run it:

| Command | What it does |
| --- | --- |
| `./scripts/dev.sh --mock` | Frontend only, with sample data in the browser. Best for UI work. |
| `./scripts/dev.sh` | Frontend plus the real Node backend, without the native host. |
| `./scripts/build-app.sh --bundle-node --open` | The full Mac app in `build/OpenCast.app`. |

The dev scripts use a separate data folder (`~/Library/Application Support/OpenCast-Dev`),
so they don't touch your everyday OpenCast data.

## Where things live

```text
apps/macos            Swift/AppKit host: windows, hotkeys, Keychain, Accessibility
packages/frontend     React UI for the launcher, chat, notes, and settings
packages/backend      Node backend: commands, data, AI, sync, extensions
packages/protocol     Shared types and settings shared by the other packages
packages/raycast-api  Runtime for Raycast-compatible extensions
packages/sync-worker  Self-hosted Cloudflare Worker for Cloud Sync
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing how the processes
talk to each other. [docs/SYNC.md](docs/SYNC.md) is the spec for Cloud Sync; keep it
accurate when you change sync behavior.

## Check your change

Run these before you open a pull request. CI runs the same checks.

```sh
pnpm typecheck
pnpm test
pnpm build
swift build -c release --package-path apps/macos
```

Then try the change the way a user would: in the app, in `./scripts/dev.sh`, or
against a local sync Worker (see [packages/sync-worker/README.md](packages/sync-worker/README.md)).
Say in the pull request what you tried.

## Pull requests

- Keep each pull request focused on one change.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for titles, for
  example `fix(sync): retry after a dropped connection`.
- Match the style of the code around your change.
- Don't commit secrets, API keys, `.dev.vars`, or local Wrangler config.
- Note any change to a user-visible flow, and add a screenshot for UI changes.

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE).
