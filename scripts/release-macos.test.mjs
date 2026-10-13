import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';

const publisher = readFileSync(new URL('./release-macos.sh', import.meta.url));
const mockGitHub = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const stateFile = process.env.MOCK_STATE;
const s = JSON.parse(fs.readFileSync(stateFile));
const a = process.argv.slice(2);
const value = key => a[a.indexOf(key) + 1];
const save = () => fs.writeFileSync(stateFile, JSON.stringify(s));
const fail = message => { console.error(message); process.exit(1); };
s.calls.push(a); save();
if (a[0] === 'api') {
  const endpoint = a[1];
  if (endpoint.includes('/compare/')) console.log('ahead');
  else if (endpoint.includes('/git/ref/tags/')) {
    if (s.tagError) fail(s.tagError);
    if (!s.tag) fail('gh: Not Found (HTTP 404)');
    console.log((s.annotated ? 'tag' : 'commit') + '\\t' + s.tag);
  } else if (endpoint.includes('/git/tags/')) console.log('commit\\t' + s.target);
  else if (endpoint.includes('/releases/tags/')) {
    if (s.releaseError) fail(s.releaseError);
    if (!s.release) fail('gh: Not Found (HTTP 404)');
    console.log(JSON.stringify({ id: s.id, draft: s.release === 'draft',
      target_commitish: s.target || s.revision, assets: s.assets }));
  }
  else if (endpoint.endsWith('/git/refs')) {
    if (s.tag || s.tagRace) fail('gh: Reference already exists (HTTP 422)');
    s.tag = a.find(arg => arg.startsWith('sha=')).slice(4); save();
  } else if (endpoint.endsWith('/commits/main')) console.log(s.revision);
  else console.log('main');
} else if (a[0] === 'release') {
  if (a[1] === 'view') {
    if (!s.release) fail('release not found');
    if (a.includes('--json')) {
      const field = value('--json');
      if (field === 'isDraft') console.log(s.release === 'draft');
      else if (field === 'targetCommitish') console.log(s.target || s.revision);
      else if (field === 'assets') console.log(s.assets.join('\\n'));
      else if (field === 'url') console.log('https://example.invalid/release');
      else fail('Unexpected field: ' + field);
    }
  } else if (a[1] === 'download') {
    for (let i = 0; i < a.length; i++) {
      if (a[i] === '--pattern') fs.copyFileSync(path.join(s.remote, a[i + 1]), path.join(value('--dir'), a[i + 1]));
    }
  } else if (a[1] === 'create') {
    if (!a.includes('--verify-tag') || s.tag !== s.revision) fail('wrong tag');
    s.release = 'draft'; s.assets = [];
    if (s.retargetOnCreate) s.tag = '0'.repeat(40);
    save();
  } else if (a[1] === 'upload') {
    if (s.release !== 'draft') fail('attempted published overwrite');
    if (a.includes('--clobber')) fail('attempted overwrite');
    const file = a[a.length - 1];
    const name = path.basename(file);
    if (s.assets.includes(name)) fail('asset already exists');
    fs.copyFileSync(file, path.join(s.remote, name));
    s.assets.push(name);
    if (s.retargetOnUpload) s.tag = '0'.repeat(40);
    if (s.publishOnUpload) s.release = 'published';
    save();
  } else if (a[1] === 'edit') { s.release = 'published'; save(); }
  else fail('Unexpected release command');
} else fail('Unexpected command');
`;

function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'opencast-release-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  writeFileSync(join(repo, 'scripts/release-macos.sh'), publisher, { mode: 0o755 });
  writeFileSync(join(repo, 'package.json'), '{"version":"0.1.0"}\n');
  writeFileSync(join(repo, '.gitignore'), 'build/\n');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('-c', 'user.name=Release test', '-c', 'user.email=test@example.invalid', 'commit', '--no-gpg-sign', '-qm', 'fixture');
  const revision = git('rev-parse', 'HEAD');
  const name = 'OpenCast-0.1.0-build.1-arm64';
  const local = join(repo, 'build/releases/v0.1.0-build.1');
  const remote = join(dir, 'remote');
  mkdirSync(local, { recursive: true });
  mkdirSync(remote);
  const assets = [name + '.dmg', name + '.dmg.sha256', name + '.json'];
  const writeAssets = (dest, bytes, source = revision) => {
    writeFileSync(join(dest, assets[0]), bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(dest, assets[1]), hash + '  ' + assets[0] + '\n');
    writeFileSync(join(dest, assets[2]), JSON.stringify({ version: '0.1.0', build: 1,
      revision: source, architecture: 'arm64', asset: assets[0], signing: 'ad-hoc',
      notarized: false, builtOn: 'macOS' }, null, 2) + '\n');
  };
  writeAssets(local, 'verified image');
  writeAssets(remote, 'verified image');
  const statePath = join(dir, 'state.json');
  const state = { id: 123, revision, assets: options.release ? assets : [], remote, calls: [], ...options };
  if (state.tag === true) state.tag = revision;
  writeFileSync(statePath, JSON.stringify(state));
  const gh = join(dir, 'gh');
  writeFileSync(gh, mockGitHub);
  chmodSync(gh, 0o755);
  const run = () => spawnSync('bash', ['scripts/release-macos.sh'], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, GH_REPO: 'test/opencast',
      MOCK_STATE: statePath, PATH: dir + ':' + process.env.PATH },
  });
  const calls = () => JSON.parse(readFileSync(statePath)).calls;
  const writes = () => calls().filter(a => a[0] === 'release' && ['create', 'upload', 'edit'].includes(a[1]) || a[0] === 'api' && a.includes('POST'));
  return { run, calls, writes, remote, assets, writeAssets, revision };
}

test('creates an exact tag and publishes a draft only after validation', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const writes = f.writes();
  assert.deepEqual(writes.map(a => a[0] === 'api' ? 'tag' : a[1]), ['tag', 'create', 'upload', 'upload', 'upload', 'edit']);
  assert.ok(writes[0].includes('sha=' + f.revision));
});
test('rejects an unrelated existing tag without a release', t => {
  const f = fixture(t, { tag: '0'.repeat(40) });
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.writes(), []);
});
test('resolves an annotated tag before deciding to publish', t => {
  const f = fixture(t, { tag: '1'.repeat(40), annotated: true, target: '0'.repeat(40) });
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.writes(), []);
});
test('does not treat API failures as missing tags', t => {
  const f = fixture(t, { tagError: 'gh: Server error (HTTP 500)' });
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.writes(), []);
});
test('does not publish if another writer creates the tag first', t => {
  const f = fixture(t, { tagRace: true });
  assert.notEqual(f.run().status, 0);
  assert.ok(!f.calls().some(a => a[0] === 'release' && ['create', 'upload', 'edit'].includes(a[1])));
});
test('accepts an identical published retry without writes', t => {
  const f = fixture(t, { tag: true, release: 'published' });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(f.calls().some(a => a[1] === 'download'));
  assert.deepEqual(f.writes(), []);
});
test('rejects changed published bytes even with a regenerated checksum', t => {
  const f = fixture(t, { tag: true, release: 'published' });
  f.writeAssets(f.remote, 'replacement image');
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.writes(), []);
});
test('rejects corrupted published bytes with the original checksum', t => {
  const f = fixture(t, { tag: true, release: 'published' });
  writeFileSync(join(f.remote, f.assets[0]), 'corrupted image');
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.writes(), []);
});
test('rejects a replaced source manifest', t => {
  const f = fixture(t, { tag: true, release: 'published' });
  f.writeAssets(f.remote, 'verified image', '0'.repeat(40));
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.writes(), []);
});
test('release lookup failures cannot bypass published asset protection', t => {
  const f = fixture(t, { tag: true, release: 'published', releaseError: 'gh: Server error (HTTP 500)' });
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(f.writes(), []);
});
test('rejects a tag retargeted during draft creation', t => {
  const f = fixture(t, { retargetOnCreate: true });
  assert.notEqual(f.run().status, 0);
  assert.ok(!f.calls().some(a => a[0] === 'release' && ['upload', 'edit'].includes(a[1])));
});
test('rejects a tag retargeted during upload before making the draft public', t => {
  const f = fixture(t, { retargetOnUpload: true });
  assert.notEqual(f.run().status, 0);
  assert.ok(!f.calls().some(a => a[0] === 'release' && a[1] === 'edit'));
});
test('does not edit a draft another writer made public', t => {
  const f = fixture(t, { publishOnUpload: true });
  assert.notEqual(f.run().status, 0);
  assert.ok(!f.calls().some(a => a[0] === 'release' && a[1] === 'edit'));
});
test('resumes a partial draft by comparing present files and uploading missing ones', t => {
  const f = fixture(t, { tag: true, release: 'draft', assets: ['OpenCast-0.1.0-build.1-arm64.dmg'] });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const uploads = f.calls().filter(a => a[0] === 'release' && a[1] === 'upload');
  assert.equal(uploads.length, 2);
  assert.ok(!uploads.some(a => a.includes('--clobber')));
});
