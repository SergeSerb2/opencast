# License sources

`scripts/collect-licenses.mjs` generates the app's notices from the installed
production dependencies of frontend, backend, and raycast-api. It includes their
full dependency closure, including code removed by tree shaking. It reads all
LICENSE, LICENCE, COPYING, COPYRIGHT, and NOTICE files within each package,
without following nested node_modules. Each package version has its own entry.
The build fails if a license identifier or full license text is missing.

The following exact-version exceptions address missing files in npm archives:

- `boolbase-1.0.0-ISC.txt`: upstream [LICENSE at
  be0bcd8](https://github.com/fb55/boolbase/blob/be0bcd8a4e917a0a5895e95b523fbbed05a64871/LICENSE).
- `javascript-natural-sort-0.7.1-MIT.txt`: the original author's upstream
  [LICENSE at 7371332](https://github.com/overset/javascript-natural-sort/blob/737133249531169aeb94c701e536d405fa077b25/LICENSE).
  The npm package credits Jim Palmer and declares MIT in `package.json` and
  `naturalSort.js`; its packaging fork omits this file.
- `seedrandom@3.0.5`: full license headers in the installed `seedrandom.js` and
  `lib/alea.js` are collected directly, including both copyright notices.

Other sources are taken directly from each installed package version:

- Inter and JetBrains Mono: the Fontsource packages' `LICENSE` files contain
  their font copyrights and full SIL Open Font License 1.1.
- Lucide: `lucide-react/LICENSE` includes its ISC text and the Feather MIT notice.
- mathjs: `LICENSE` (Apache-2.0) and `NOTICE`.
- highlight.js: each installed version's `LICENSE` (BSD-3-Clause).
- Raycast API 2.7.3 declarations/constants: the existing full MIT notice in
  `packages/raycast-api/THIRD-PARTY-NOTICES.md`.
- OpenCast: the repository's root `LICENSE`.

Node's full `LICENSE`, including its bundled dependencies, comes from the same
official archive as its executable. `prepare-release-node.sh` pins Node 22.23.1
and verifies the architecture-specific archive checksum before extraction. It
records the archive URL and hashes of the executable and license in
`opencast-node.json`. The collector checks that pair before app signing. Update
the version and archive checksums together when updating Node. `OPENCAST_NODE`
must point to an executable prepared by that script, with its adjacent LICENSE
and provenance file intact.

The app contains `licenses/OpenCast-LICENSE.txt`, `THIRD-PARTY-NOTICES.txt`,
`Node-LICENSE.txt` when Node is bundled, separate font/Lucide texts, and
`inventory.json` with package versions, license identifiers, source filenames,
and hashes of the shipped notice files. No network license lookup occurs during
collection.
