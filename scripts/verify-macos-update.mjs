import { readFileSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const distribution = JSON.parse(readFileSync('releases/macos.json', 'utf8'));
const plist = readFileSync('apps/macos/Resources/Info.plist', 'utf8');
const publicKey = Buffer.from(plist.match(/<key>SUPublicEDKey<\/key>\s*<string>([^<]+)<\/string>/)?.[1] ?? '', 'base64');
assert.equal(publicKey.length, 32, 'Missing Sparkle public key');
assert(plist.includes(`<string>${distribution.baseURL}appcast.xml</string>`), 'App feed differs from release hosting');
const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), publicKey]), format: 'der', type: 'spki' });

export function verifyFeed(feed) {
  // Sparkle 2 signs the exact bytes before the final signing comment.
  const marker = feed.lastIndexOf('<!-- sparkle-signatures:\n');
  assert(marker > 0, 'Missing signed Sparkle appcast');
  const block = feed.subarray(marker).toString('utf8').match(/^<!-- sparkle-signatures:\nedSignature: ([A-Za-z0-9+/=]+)\nlength: ([0-9]+)\n-->\n$/);
  assert(block, 'Invalid Sparkle signing block');
  const content = feed.subarray(0, marker);
  assert.equal(Number(block[2]), content.length, 'Changed appcast length');
  assert(verify(null, content, key, Buffer.from(block[1], 'base64')), 'Invalid appcast signature');
  return content.toString('utf8');
}

export function verifyAssets(args) {
  assert.equal(args.length, 5, 'Usage: node scripts/verify-macos-update.mjs directory asset-name version build revision');
  const [dir, name, version, build, revision] = args;
  const manifest = JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8'));
  assert.deepEqual(manifest, { version, build: Number(build), revision, architecture: 'arm64',
    asset: `${name}.dmg`, signing: 'ad-hoc', notarized: false, builtOn: 'macOS' });
  const dmg = readFileSync(`${dir}/${name}.dmg`);
  const hash = createHash('sha256').update(dmg).digest('hex');
  assert.equal(readFileSync(`${dir}/${name}.dmg.sha256`, 'utf8'), `${hash}  ${name}.dmg\n`);
  const feed = readFileSync(`${dir}/appcast.xml`);
  const xml = verifyFeed(feed);
  assert(xml.includes(`<sparkle:version>${build}</sparkle:version>`), 'Appcast build mismatch');
  assert(xml.includes(`<sparkle:shortVersionString>${version}</sparkle:shortVersionString>`), 'Appcast version mismatch');
  const enclosures = xml.match(/<enclosure\b[^>]*>/g) ?? [];
  assert.equal(enclosures.length, 1, 'Expected one full update');
  const attrs = Object.fromEntries([...enclosures[0].matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  assert.equal(attrs.url, `${distribution.baseURL}v${version}-build.${build}/${name}.dmg`);
  assert.equal(Number(attrs.length), dmg.length, 'Appcast archive length mismatch');
  assert(verify(null, dmg, key, Buffer.from(attrs['sparkle:edSignature'] ?? '', 'base64')), 'Invalid update signature');
  console.log(`Verified signed Sparkle feed and DMG for ${version} build ${build}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) verifyAssets(process.argv.slice(2));
