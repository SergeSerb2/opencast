import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { distribution, verifyAssets, verifyFeed } from './verify-macos-update.mjs';
import { withR2Budget } from '../r2-storage-budget.mjs';

assert.equal(process.argv.length, 2, 'Usage: node scripts/publish-cloudflare-update.mjs');
assert(/^[a-f0-9]{32}$/.test(process.env.AWS_ACCESS_KEY_ID ?? ''), 'R2 AWS_ACCESS_KEY_ID is required');
assert(/^[a-f0-9]{64}$/.test(process.env.AWS_SECRET_ACCESS_KEY ?? ''), 'R2 AWS_SECRET_ACCESS_KEY is required');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(git('status', '--porcelain'), '', 'Publish from a clean checkout');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const build = git('rev-list', '--count', 'HEAD');
const revision = git('rev-parse', 'HEAD');
const tag = `v${version}-build.${build}`;
const name = `OpenCast-${version}-build.${build}-arm64`;
const directory = `build/releases/${tag}`;
verifyAssets([directory, name, version, build, revision]);
const feed = readFileSync(`${directory}/appcast.xml`);
assert(/^[a-f0-9]{32}$/.test(distribution.accountId), 'Invalid Cloudflare account');
assert(/^[a-z0-9-]+$/.test(distribution.bucket), 'Invalid R2 bucket');
const endpoint = `https://${distribution.accountId}.r2.cloudflarestorage.com/${distribution.bucket}/`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = value => {
  assert(!/[\x00-\x1f\x7f]/.test(value), 'Invalid curl configuration value');
  return JSON.stringify(value);
};

async function request(object, method = 'GET', file, contentType, cacheControl, budgetHeld = false) {
  if (method === 'PUT' && !budgetHeld) {
    return withR2Budget({ bucket: distribution.bucket, key: object,
      bytes: readFileSync(file).length },
    () => request(object, method, file, contentType, cacheControl, true));
  }
  // curl signs S3 requests with SigV4. Credentials travel through stdin only.
  const config = [
    'silent', 'show-error', 'max-time = 60',
    `url = ${quote(endpoint + object.split('/').map(encodeURIComponent).join('/'))}`,
    `request = ${quote(method)}`,
    'aws-sigv4 = "aws:amz:auto:s3"',
    `user = ${quote(`${process.env.AWS_ACCESS_KEY_ID}:${process.env.AWS_SECRET_ACCESS_KEY}`)}`,
    `header = ${quote(`x-amz-content-sha256: ${hash(file ? readFileSync(file) : '')}`)}`,
  ];
  if (file) config.push(
    `data-binary = ${quote('@' + resolve(file))}`,
    `header = ${quote('Content-Type: ' + contentType)}`,
    `header = ${quote('Cache-Control: ' + cacheControl)}`,
  );
  const result = spawnSync('/usr/bin/curl', ['--config', '-', '--write-out', '\n%{http_code}'], {
    input: config.join('\n'), maxBuffer: 256 * 1024 * 1024, timeout: 65000,
  });
  assert.equal(result.status, 0, 'R2 request failed; check connectivity and curl SigV4 support');
  const status = Number(result.stdout.subarray(-3).toString());
  if (method === 'GET' && status === 404) return null;
  assert(status >= 200 && status < 300, `R2 ${method} failed with HTTP ${status}`);
  return result.stdout.subarray(0, -4);
}

// GitHub serializes publish jobs. Read the authoritative R2 feed, not a CDN cache.
const previous = await request('appcast.xml');
if (previous) {
  const versions = [...verifyFeed(previous).matchAll(/<sparkle:version>([0-9]+)<\/sparkle:version>/g)];
  assert(versions.length <= 1, 'Unexpected multi-release feed');
  const previousBuild = BigInt(versions[0]?.[1] ?? '0');
  if (previousBuild > BigInt(build)) {
    console.log(`Kept newer Sparkle build ${previousBuild}`);
    process.exit(0);
  }
  if (previousBuild === BigInt(build)) {
    assert(previous.equals(feed), 'Published feed differs for this build; repair explicitly');
  }
}

for (const [asset, type] of [
  [`${name}.dmg`, 'application/x-apple-diskimage'],
  [`${name}.dmg.sha256`, 'text/plain'],
  [`${name}.json`, 'application/json'],
  ['appcast.xml', 'application/rss+xml'],
]) {
  const object = `${tag}/${asset}`;
  const bytes = readFileSync(`${directory}/${asset}`);
  const existing = await request(object);
  if (existing) {
    assert(existing.equals(bytes), `Published ${asset} differs; repair explicitly`);
  } else {
    await request(object, 'PUT', `${directory}/${asset}`, type, 'public, max-age=31536000, immutable');
    assert(bytes.equals(await request(object)), `R2 read-back differs for ${asset}`);
  }
}
// Publish the discoverable feed only after every referenced archive is durable.
if (!previous?.equals(feed)) {
  await request('appcast.xml', 'PUT', `${directory}/appcast.xml`, 'application/rss+xml', 'no-store');
}
assert(feed.equals(await request('appcast.xml')), 'R2 feed read-back differs');
const live = await fetch(`${distribution.baseURL}appcast.xml`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
assert(live.ok, `Public appcast returned HTTP ${live.status}`);
assert(feed.equals(Buffer.from(await live.arrayBuffer())), 'Public feed differs from signed release');
console.log(`Published Sparkle build ${build} at ${distribution.baseURL}appcast.xml`);
