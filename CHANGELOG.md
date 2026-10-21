# Changelog

OpenCast publishes a DMG for every merge to `main`. Each release lists its commits.
This file collects the changes that matter to people who use OpenCast.

## Unreleased

### Easier Cloud Sync

- Deploy the sync server with a **Deploy to Cloudflare** button. OpenCast can
  generate the access token for you.
- `./scripts/deploy-sync.sh` creates the database, generates the token, checks the
  server, and prints a setup code. It no longer edits tracked files.
- The sync server creates its database tables on first use. Running migrations is
  optional.
- Connect in two steps. OpenCast checks the server first, then asks you to create
  a vault or join the existing one. A typing mistake can no longer create a
  second vault.
- Add another Mac with a setup code: copy it on a connected Mac, paste it on the
  new one, and type your passphrase.
- Change your vault passphrase or access token without reconnecting every Mac.
- Clearer messages when a server is unreachable, not an OpenCast server, has no
  token, or rejects the token.

### Bring your own AI

- Optionally sync AI provider keys, secret headers, MCP secrets, and web-search
  keys between your Macs, end-to-end encrypted. Keys stay in the Keychain on each
  Mac. This is off until you turn on **AI & MCP Keys**.
- **Add Provider** finds Ollama, LM Studio, and other local servers that are running.
- **Test** works before you save a provider, and can send a one-token chat request.
- Providers and MCP servers that are missing a key on this Mac say so.
- Changing an API key refreshes the model list.
- Tool calls from Ollama and other OpenAI-compatible servers run reliably.

### Fixes

- Dozens of fixes across sync, AI, the Mac app, the launcher, notes, and settings.
  Highlights: safer paste targeting, private clipboard items are never captured,
  MCP servers are included in backups, and remote images can no longer reach
  private network addresses.

### Project

- The DMG includes the full license texts of OpenCast, Node, fonts, icons, and
  every bundled dependency.
- Contributing guide, security policy, code of conduct, and issue templates.
