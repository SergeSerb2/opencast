# OpenCast macOS releases

## Download, verify, and install

Download the DMG and its matching `.dmg.sha256` file from
[the latest release](https://github.com/SergeSerb2/opencast/releases/latest).
Releases support **Apple silicon (arm64), macOS 14 or later**. Node is included;
you do not need development tools to run the app.

Put both downloaded files in the same folder. In Terminal, change to that folder
and check the checksum, using the actual downloaded filename:

```sh
shasum -a 256 -c OpenCast-<version>-build.<number>-arm64.dmg.sha256
```

Continue only if the result is `OK`. Open the DMG, drag `OpenCast.app` to
Applications, then open it from Applications.

The app is **ad-hoc signed and is not notarized**. If macOS blocks it:

1. Try to open OpenCast once, then dismiss the alert.
2. Open **System Settings → Privacy & Security**.
3. Find the message about OpenCast and select **Open Anyway**.
4. Confirm with **Open** and authenticate if macOS asks.

See [Apple's instructions](https://support.apple.com/en-us/102445). Developer ID
signing and notarization need an Apple Developer certificate and notarization
credentials. They are not set up yet.

## Automatic updates

Sparkle 2 checks for updates daily, downloads them in the background, and installs
them when OpenCast quits. Use **Check for Updates…** in the OpenCast app menu or
menu bar icon menu to check now. Turn **Automatically Check for Updates** off in
either menu to stop scheduled checks. Sparkle's update alert also has a control
for automatic downloads. These choices persist across launches.

Updates and the appcast are signed with Ed25519. The app verifies the feed and
verifies each DMG before extraction. The public key is in `Info.plist`.
The live feed is [opencast-updates.sergeserbinenko.com/appcast.xml](https://opencast-updates.sergeserbinenko.com/appcast.xml).
The feed and versioned downloads are served by the `opencast-releases` Cloudflare
R2 bucket, on the maintainer's domain. Public hosting settings are in
[`releases/macos.json`](../releases/macos.json). Build numbers increase with Git
history, so updates work even when the displayed app version stays the same.

The Actions build job needs the repository secret `SPARKLE_PRIVATE_KEY`, exported
with Sparkle's `generate_keys -x` tool. The matching key is kept in the maintainer's
login Keychain under Sparkle account `opencast`. Local signing uses that account
when the secret environment variable is absent. Keep a secure backup of this key;
do not generate a replacement for an already distributed public key. Forks must
generate their own key, set their own public key and feed URL, and configure their
own Actions secret before publishing. Never put the private key in source or logs.

The publish job also needs `OPENCAST_R2_ACCESS_KEY_ID` and
`OPENCAST_R2_SECRET_ACCESS_KEY`, from an R2 object read/write token restricted to
`opencast-releases`. They are supplied as `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` only for the R2 upload step. Local R2 publication uses the
same environment variables and `node scripts/publish-cloudflare-update.mjs` from a
clean checkout with its verified release artifacts present. Run only one publisher
at a time; Actions serializes publish jobs. Forks must also change the public R2
configuration and app feed URL before deploying.

Versions shipped before Sparkle was added need one manual DMG installation to
gain automatic updates. Developer ID signing and notarization remain separate
from Sparkle's update signatures.

## How releases are built and published

A successful `CI` workflow from a push to `main` starts
[Release OpenCast DMG](../.github/workflows/release-macos.yml) for that exact
commit. Maintainers can also use its **Run workflow** action on `main`. Each
commit has its own concurrency group, so later merges do not cancel earlier
release builds. Releases are Apple silicon only; packaging fails early on Intel.

For a public repository, both release jobs use fresh GitHub-hosted `macos-15`
runners. The private repository uses separate self-hosted build and publish roles.
All actions are pinned to full commit SHAs. Repository permission is
`contents: read` by default; only the publish job has `contents: write`.

The build job installs dependencies with the frozen lockfile, checks TypeScript,
builds the Swift host and all three web packages, then packages and verifies the
DMG. Any package build failure, missing required output, or missing dependency
license text stops the build. Build tools and the bundled Node use the same
official checksum-pinned Node distribution. The pnpm bootstrap and release
TypeScript compiler also have committed checksums. No owner-specific tools,
paths, or cached builds are required.

Tags use `v<package-version>-build.<commit-count>`, based on full Git history.
The app records the same version/build number and its exact source revision.
Each release includes:

- The Apple silicon DMG, with an Applications link.
- A `.dmg.sha256` checksum file.
- A JSON source manifest with the revision, version, build, architecture, and
  signing status.
- A signed `appcast.xml` with the signed DMG's URL and size.

The mounted app's `Contents/Resources/licenses/` contains OpenCast's MIT license,
the full Node license from its verified archive, and generated notices for the
production dependency closure of frontend, backend, and raycast-api. These
include font OFL texts, Lucide's ISC and Feather MIT notices, and each bundled
npm package's name, version, license identifier, and full license/notice text.
Sparkle's full license, including its bundled third-party notices, is included too.
See [license sources](../licenses/README.md). The DMG verifier checks these files
and their recorded hashes as well as signatures, architecture, required app
resources, and the bundled Node SQLite runtime. It does not launch the app.

The publish job downloads the verified workflow artifact and checks its checksum
and source manifest. It runs no dependency installs or builds. It uses the
short-lived workflow token. The signing secret is available only to the build
job's signing step. Before publication, Node verifies both Ed25519 signatures
against the source public key, along with the feed's version, download URL and size.
After GitHub publication, the R2 uploader compares existing versioned objects and
uploads only missing files. It verifies each upload by reading it back, then
updates `appcast.xml` with `Cache-Control: no-store`. Versioned files have immutable
cache headers. It checks the public feed bytes too. A queued older build cannot
replace a newer signed feed. The uploader uses the system curl SigV4 support
against the S3-compatible R2 endpoint. Credentials pass through stdin, never
process arguments. No dependency install is needed in the publish job.
Release notes list up to 40 non-merge commit subjects since the nearest published
ancestor release, with a full comparison link. The first release lists history.

### Safe retries

Publication starts with a draft. The script retains the release ID from draft
creation and uses that ID for uploads and publication, even while GitHub's list
views lag. It checks the tag target and draft state again before publication.
Only an explicit tag-ref 404 permits tag creation; release-list failures or
ambiguous matches stop publication.

A retry compares files already in a draft and uploads only missing assets. It
never overwrites existing assets. For an already published release, it downloads
all assets and requires an exact match with the original verified artifact.
A different tag target or changed bytes cause failure. An older queued commit
cannot replace a newer commit as the Latest release.

Retry **only the failed publish job** to reuse its original artifact. Rebuilding
can produce different DMG bytes. A missing or expired artifact requires a
maintainer to resolve the release state before proceeding.

## Build and verify locally

Requirements: an Apple silicon Mac, Xcode/Swift, Node 22.13 or later, pnpm 10.18.0,
and full Git history. Use the repository's pinned Node version for release builds:

```sh
node_path="$(./scripts/prepare-release-node.sh)"
export OPENCAST_NODE="$node_path"
export PATH="$(dirname "$node_path"):$PATH"
pnpm install --frozen-lockfile
./scripts/typecheck-release.sh
./scripts/build-dmg.sh
./scripts/sign-macos-update.sh
./scripts/verify-dmg.sh build/releases/<tag>/OpenCast-<version>-build.<number>-arm64.dmg
```

`build-dmg.sh` bundles Node and creates the checksum and source manifest after
mounted-image verification. Both the source Node and the mounted copy must link
only to macOS system libraries. `OPENCAST_NODE` must select a runtime prepared by
`prepare-release-node.sh`, with its adjacent license and provenance file intact.

`scripts/release-macos.sh` is the workflow's publisher. It consumes existing
verified files, requires a clean checkout of a commit on the default branch, and
uses the GitHub CLI with repository write access. It does not build the app.

## Private self-hosted runners (maintainer only)

Private jobs use disposable macOS VMs with `self-hosted`, `macOS`, `ARM64`, and
role labels: `opencast-ci`, `opencast-release`, or `opencast-publish`. A local
launchd controller creates a clean VM for each job and discards it afterward.
It keeps its state, logs, and Tart tools in a maintainer-configured data directory.
Inspect that launchd service and its controller log, and use `tart list` to inspect
VMs. No host files, clipboard, signing keys, or host GitHub credentials enter the
guests; the controller provides only short-lived runner registration tokens.

The host must be awake, online, and have its user session available. Jobs queue
while it is unavailable; rerun timed-out jobs once it returns. Disable this
repository's workflows to pause its automation. Stopping a shared controller can
affect other repositories. Do not restore a retired native runner for PR checks.
