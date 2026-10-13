# Native host verification

Verified on 2026-10-13 with macOS 27.2, Xcode 27 SDK and Apple Swift 6.4,
arm64, Swift 5 language mode, macOS 14 deployment target.

| Check | Result |
| --- | --- |
| `swift build -c release --package-path apps/macos` | Passed, no compiler warnings/errors |
| `./scripts/build-app.sh --skip-web` | Produced `build/OpenCast.app` |
| `codesign -v build/OpenCast.app` | Passed (ad-hoc signature) |
| `swift run -c release --package-path apps/macos OpenCastSelfTest` | Passed: two-screen geometry, halves/thirds/sixths, AX conversion, gaps, relative display movement, hotkey mappings, file-root boundaries/traversal and Keychain exclusion including case variants |
| Dev stub, approximately 15 seconds | `app.info`, 112 applications, one screen, permissions status and unknown-method response received over stdio |
| Web-view fixture | Document-start config, macOS/appearance HTML attributes, `app.info`, screens, default window-kind height call, unknown-method error and 32px Finder icon scheme passed |
| Native → backend | `backend.ping` request/response observed |
| Hotkey registration | Re-registering unchanged `opencast.toggle` succeeded |
| Required params | Missing `visible` returned InvalidParams without changing the status item |
| Second process | Exited successfully and requested that the first instance show the launcher |
| Backend restart | Terminated only the test backend once; restart produced a second authenticated frontend report after port/token reinjection and page reload |
| Shutdown | Host exited with code 0, backend children reaped, no host/stub processes remained |

Repeatable commands are in `README.md` and `DevStub/smoke-test.py`. Detailed local
compile/test output is under the ignored `apps/macos/.build/`; backend/native logs
append under `~/Library/Logs/OpenCast`. App inventories and tokens are not committed.

The tests did not change system preferences, request permissions, post keyboard
input, read clipboard contents, capture screens, trash files, sleep/lock/log out,
or quit other applications. Permission-dependent AX/input/snippet/calendar/capture
operations and destructive system actions were compiled but not exercised. Real
backend/frontend/extension integration is pending those teams' artifacts. macOS 14
vibrancy fallback is compiled but was not run on a macOS 14 machine. Unsupported
OS operations and protocol proposals are recorded in `PROTOCOL_NOTES.md`.
