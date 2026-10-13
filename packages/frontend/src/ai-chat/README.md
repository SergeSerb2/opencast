# AI Chat and Quick AI

`ai-chat.html` mounts `AIChatApp`; the launcher registers `quick-ai` through its
view registry. Both surfaces share the composer, transcript, message tree,
stream reducer, model picker and foundation Markdown/components/bridges.

## Backend integration

- Chat content comes from `ai.chats.get`. Editing and regeneration add branches;
  switching versions writes `currentLeafId` through `ai.chats.update`.
- Chat sends use `ai.chats.send`. Quick AI creates a chat with source `quick-ai`
  and uses `ai.ask` with its `chatId` for every follow-up. AI commands use
  `ai.commands.run` and must return a chat ID for launcher display.
- Subscribe to `ai.stream` before sending. Start events should include `chatId`
  and `messageId`; text/reasoning deltas are batched per animation frame. Chat
  change events refetch stored messages and metadata. Keep the stored message
  status in sync with completion, stop and error events.
- The UI uses `AIChat.titleSource`, `reasoningEffort`, `systemInstructions`, and
  `ai.chats.update` patches for source, reasoning effort and instructions.
  Sidebar folders use the synced `ai.chatFolders` setting (`AIChatFolder[]`).
- Path-less PNG/JPEG/GIF/WebP attachments use `AIAttachment.url` with an inline
  image data URL (10 MB limit). Text files use `text` (512 KB limit); other
  binaries require the native file panel. The backend must consume these inline
  URLs and validate the selected model's capabilities before provider dispatch.
- Tool permissions use `ai.confirmTool` with approved/always. Opening an
  already-running response without its start event preserves stored text and
  displays a clear error if the originating stream cannot be identified for Stop.

## Native integration

Settings opens with `window.show { kind: "settings", route: "ai" }`. Chat routes
accept a chat ID, `chat/<id>`, `new`, `add-text`/`append-text`, `add-attachment`,
or launcher payloads containing prompt/preset/command IDs. Full `ai-chat/…`
routes are also accepted. File panels and screenshots use `dialog.openFiles`
and `screen.capture`; paste/drop images work without a local file path.

## Validation and limits

Unit tests cover trees, branches, stream ordering, mentions, routes, file limits,
send shortcuts, cancellation, permissions and navigation during pending sends.
The mock supports reasoning, errors, queued follow-ups, tools, branches and AI
commands in root search. Browser validation and screenshots live outside the
repository at `/tmp/surgecast-re/ours/fe-ai/`.

The AI backend in this checkout remains an unimplemented service owned by the
backend team, so real-provider and Swift-host integration were not exercised.
Browser glass approximates the system material; the Surgecast logo is reused
instead of proprietary reference artwork. Math rendering is optional and absent.
