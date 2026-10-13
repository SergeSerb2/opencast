# OpenCast macOS releases

Download the DMG from [the latest GitHub release](https://github.com/SergeSerb2/opencast/releases/latest).
These builds target Apple silicon and macOS 14 or later. Node is included. Drag
OpenCast.app to Applications, then open it from Applications.

The app is ad-hoc signed and is not notarized. The build Mac currently has no
Developer ID certificate. If macOS blocks the app, follow
[Apple's Open Anyway instructions](https://support.apple.com/guide/mac-help/mh40616/mac).

## Release after a merge

After a merge to `main`, the existing `CI` workflow runs. A successful CI run from
a push to `main` starts `Release OpenCast DMG` for that exact commit. Each commit
has its own concurrency group, so a later merge does not cancel an earlier build.
PR code is checked on GitHub-hosted runners; the release job runs after merging.

The dedicated repository runner is `opencast-local-mac-arm64`, with labels
`self-hosted`, `macOS`, `ARM64`, and `opencast-release`. It is installed on the
build Mac at `~/.local/share/opencast/actions-runner` as a user launchd service.
The Mac must be awake and online with the user session available. Jobs queue while
the runner is unavailable. GitHub cancels jobs that exceed its queue timeout;
rerun failed CI or use the manual release action when the Mac is available again.

The workflow has a manual **Run workflow** action on `main`. It uses full Git
history and the package version to assign `v<version>-build.<commit-count>` tags.
The app's build number uses the same count, and `OpenCastSourceRevision` records
the source commit in its bundle. Releases use drafts until all assets are uploaded.
Re-running a published release checks its commit and assets instead of replacing
it. Older queued commits do not replace a newer commit as the Latest release.

The runner uses the workflow's short-lived `GITHUB_TOKEN` to publish releases.
There is no personal access token or signing secret in the repository. Other
repositories' runners on this Mac are independent of the OpenCast runner.

## Build and verify locally

Requirements: macOS, Xcode/Swift, Node 22.13+, pnpm 10, and Git history that is not
shallow. Publishing also needs the GitHub CLI signed in with repository write
access. Use a clean checkout of a commit on the repository's default branch.

```sh
pnpm install --frozen-lockfile
./scripts/build-dmg.sh
./scripts/verify-dmg.sh build/releases/<tag>/OpenCast-<version>-build.<number>-arm64.dmg
./scripts/release-macos.sh
```

`build-dmg.sh` compiles the full app, bundles Node, stamps version/build/source
metadata, creates an Applications link in the DMG, and mounts the finished image
read-only for verification. Verification checks the app signature, architecture,
page/backend/runtime files, and the bundled Node SQLite runtime.

Each release contains the DMG, its `.dmg.sha256` checksum, and a JSON source
manifest. To check a downloaded image, put its checksum file beside it and run:

```sh
shasum -a 256 -c OpenCast-<version>-build.<number>-arm64.dmg.sha256
```

The build scripts use ad-hoc signatures. Developer ID signing and notarization
need a separate certificate and Apple notarization credentials before they can
replace this release method.

## Manage the runner on the build Mac

```sh
cd ~/.local/share/opencast/actions-runner
./svc.sh status
./svc.sh stop
./svc.sh start
```

To remove this automation, disable the release workflow in GitHub, stop and
uninstall this runner's service, and remove this runner in the repository's
Actions settings. Do not change the runner used by another repository.
