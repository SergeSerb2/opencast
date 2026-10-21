import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [destination, node = ''] = process.argv.slice(2);
assert(destination && process.argv.length <= 4, 'Usage: node scripts/collect-licenses.mjs output-directory [node-binary]');
const output = resolve(destination);
const read = file => readFileSync(file, 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const packages = new Map();
const keyFiles = new Map([
  ['@fontsource-variable/inter', 'Inter-OFL.txt'],
  ['@fontsource/jetbrains-mono', 'JetBrainsMono-OFL.txt'],
  ['lucide-react', 'Lucide-LICENSE.txt'],
]);
// These npm archives omit a license file. Exceptions are exact-version only.
const supplements = new Map([
  ['boolbase@1.0.0', 'boolbase-1.0.0-ISC.txt'],
  ['javascript-natural-sort@0.7.1', 'javascript-natural-sort-0.7.1-MIT.txt'],
]);

function licenseFiles(directory, prefix = '') {
  const files = [];
  for (const entry of readdirSync(join(directory, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const name = join(prefix, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      files.push(...licenseFiles(directory, name));
    } else if (entry.isFile() && /^(licen[sc]e|copying|copyright|notice)(?:[-_][a-z0-9._-]+)?(?:\.(?:txt|md|markdown|rst|html?))?$/i.test(entry.name)) {
      files.push({ source: name, text: read(join(directory, name)) });
    }
  }
  return files;
}

// Include the complete production closure of the three shipped outputs, even
// where tree shaking removes some code. Build/test tools and sync-worker stay out.
const inventory = JSON.parse(execFileSync('pnpm', [
  '--filter', '@opencast/frontend', '--filter', '@opencast/backend',
  '--filter', '@opencast/raycast-api', 'licenses', 'list', '--prod', '--json',
], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
assert(Object.keys(inventory).length, 'Production license inventory is empty');
for (const group of Object.values(inventory)) {
  assert(Array.isArray(group), 'Invalid pnpm license inventory');
  for (const dependency of group) {
    assert(dependency.paths?.length, `Missing installed package: ${dependency.name}`);
    for (const directory of dependency.paths) {
      const manifest = JSON.parse(read(join(directory, 'package.json')));
      assert.equal(manifest.name, dependency.name);
      assert(dependency.versions.includes(manifest.version));
      const id = `${manifest.name}@${manifest.version}`;
      const license = typeof manifest.license === 'string' ? manifest.license : manifest.license?.type;
      assert(license && !/^(UNLICENSED|UNKNOWN)$/i.test(license), `Missing license identifier: ${id}`);
      const files = licenseFiles(directory);
      if (supplements.has(id)) {
        const source = `licenses/${supplements.get(id)}`;
        files.push({ source, text: read(join(root, source)) });
      }
      // seedrandom publishes its full MIT texts as source headers, including
      // Johannes Baagoe's separate copyright for Alea.
      if (id === 'seedrandom@3.0.5') {
        for (const source of ['seedrandom.js', 'lib/alea.js']) {
          const text = read(join(directory, source));
          const header = text.startsWith('/*') ? text.slice(0, text.indexOf('*/') + 2) : text.split('\n\n\n')[0];
          assert(header.includes('Permission is hereby granted') && header.includes('THE SOFTWARE'), `Missing embedded license: ${id}/${source}`);
          files.push({ source: `${source} (license header)`, text: header });
        }
      }
      assert(files.length && files.every(file => file.text.trim()), `Missing license text: ${id}`);
      assert(files.some(file => /licen[sc]e|copying|license header/i.test(file.source)), `Missing full license: ${id}`);
      const record = { name: manifest.name, version: manifest.version, license, files };
      if (packages.has(id)) assert.deepEqual(packages.get(id), record, `Conflicting license copies: ${id}`);
      packages.set(id, record);
    }
  }
}
// The declarations and constants copied into the extension runtime have an
// existing full upstream notice outside node_modules.
packages.set('@raycast/api@2.7.3', { name: '@raycast/api', version: '2.7.3', license: 'MIT',
  files: [{ source: 'packages/raycast-api/THIRD-PARTY-NOTICES.md', text: read(join(root, 'packages/raycast-api/THIRD-PARTY-NOTICES.md')) }] });

mkdirSync(output, { recursive: true });
const written = {};
function write(name, text) {
  writeFileSync(join(output, name), text);
  written[name] = hash(text);
}
write('OpenCast-LICENSE.txt', read(join(root, 'LICENSE')));
const records = [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'));
write('THIRD-PARTY-NOTICES.txt', [
  'OpenCast third-party notices',
  'Production dependency closure of frontend, backend, and raycast-api; includes tree-shaken dependencies.',
  ...records.map(record => [
    `\n${'='.repeat(80)}\n${record.name}@${record.version}\nLicense: ${record.license}`,
    ...record.files.map(file => `\n--- ${file.source} ---\n${file.text}`),
  ].join('\n')),
].join('\n') + '\n');
for (const [name, filename] of keyFiles) {
  const matches = records.filter(record => record.name === name);
  assert(matches.length === 1, `Expected one bundled version of ${name}`);
  write(filename, matches[0].files.map(file => file.text).join('\n\n'));
}
let runtime = null;
if (node) {
  const binary = realpathSync(node);
  const directory = dirname(dirname(binary));
  runtime = JSON.parse(read(join(directory, 'opencast-node.json')));
  assert.equal(execFileSync(binary, ['-p', 'process.versions.node'], { encoding: 'utf8' }).trim(), runtime.version);
  assert.equal(hash(readFileSync(binary)), runtime.binarySHA256, 'Node differs from the verified archive; run prepare-release-node.sh');
  const license = read(join(directory, 'LICENSE'));
  assert(license.includes('Copyright Node.js contributors') && license.length > 1000, 'Missing full Node license');
  assert.equal(hash(license), runtime.licenseSHA256, 'Node license differs from the verified archive');
  write('Node-LICENSE.txt', license);
}
writeFileSync(join(output, 'inventory.json'), JSON.stringify({
  packages: records.map(({ name, version, license, files }) => ({ name, version, license,
    sources: files.map(file => file.source) })), node: runtime, files: written,
}, null, 2) + '\n');
console.log(`Collected full notices for ${records.length} package versions${runtime ? ` and Node ${runtime.version}` : ''}`);
