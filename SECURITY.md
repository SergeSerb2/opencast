# Security policy

## Report a vulnerability

Please report security problems privately through GitHub:
**[Report a vulnerability](https://github.com/SergeSerb2/opencast/security/advisories/new)**.

Don't open a public issue, pull request, or discussion for a security problem.

Include what you found, how to reproduce it, and the OpenCast build you tested
(Settings → About). I'll reply as soon as I can, usually within a week, and keep you
updated until it's fixed. Tell me if you'd like credit in the release notes.

## Supported versions

OpenCast is early software. Only the
[latest release](https://github.com/SergeSerb2/opencast/releases/latest) gets
security fixes.

## Scope

These are especially useful to hear about:

- Ways to read Cloud Sync data without the vault passphrase, or to change it without
  detection. The design and its known limits are in [docs/SYNC.md](docs/SYNC.md).
- Access to API keys or other Keychain secrets from outside OpenCast.
- Ways for a web page, AI response, clipboard item, or extension to run code or
  read files it shouldn't.
- Bypasses of the confirmation for destructive deeplinks.

Problems in a sync server that you deployed yourself with changed code, or in
third-party AI providers and extensions, are out of scope. Report those to their
owners.
