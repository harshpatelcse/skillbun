import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, createDecipheriv } from 'node:crypto';

const scriptSource = fs.readFileSync(new URL('../../scripts/encrypt-docs.js', import.meta.url));
const testKey = 'a'.repeat(64);
const pepper = Buffer.from('SkillBunVault2026!HopIntoSecurity@SBV1#Pepper$Key%Guard');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skillbun-vault-refresh-'));
  t.after(() => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(directory));
    assert.ok(relative.startsWith('skillbun-vault-refresh-') && !relative.includes(path.sep) && !path.isAbsolute(relative));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(directory, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'public/data/docs/frontend'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'scripts/encrypt-docs.js'), scriptSource);
  const sourcePath = topic => path.join(directory, `public/data/docs/frontend/${topic}.md`);
  const vaultPath = topic => {
    const hash = createHash('sha256').update(`sbv1:frontend/${topic}`).digest('hex').slice(0, 24);
    return path.join(directory, `content/docs/${hash.slice(0, 2)}/${hash}.sbv`);
  };
  const run = (args = [], key = testKey) => spawnSync(process.execPath, [path.join(directory, 'scripts/encrypt-docs.js'), ...args], {
    cwd: directory, encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot || '', DOCS_ENCRYPTION_KEY: key },
  });
  fs.writeFileSync(sourcePath('first'), '# First guide\n[Docs](https://docs.example.org/old)\n');
  fs.writeFileSync(sourcePath('second'), '# Second guide\nUnchanged teaching content.\n');
  assert.equal(run().status, 0);
  const indexPath = path.join(directory, 'content/docs/_index.sbv');
  return { sourcePath, vaultPath, run, indexPath };
}

function decryptGuide(data, identity) {
  const prk = createHmac('sha256', data.subarray(5, 21)).update(Buffer.from(testKey, 'hex')).digest();
  const key = createHmac('sha256', prk).update(Buffer.concat([Buffer.from(`sbv1:studyguide:${identity}`), Buffer.from([1])])).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(21, 33));
  decipher.setAuthTag(data.subarray(33, 49));
  const scrambled = Buffer.concat([decipher.update(data.subarray(81)), decipher.final()]);
  const plaintext = Buffer.from(scrambled.map((byte, index) => byte ^ pepper[index % pepper.length] ^ ((index * 7 + 13) & 255)));
  assert.deepEqual(createHash('sha256').update(plaintext).digest(), data.subarray(49, 81));
  return plaintext;
}

test('changed-only refresh updates one guide, decrypts correctly and preserves other ciphertext and manifest bytes', t => {
  const files = fixture(t);
  const originalFirst = fs.readFileSync(files.vaultPath('first'));
  const originalSecond = fs.readFileSync(files.vaultPath('second'));
  const originalIndex = fs.readFileSync(files.indexPath);
  const updated = '# First guide\n[Docs](https://docs.example.org/current)\n';
  fs.writeFileSync(files.sourcePath('first'), updated);
  assert.equal(files.run(['--changed-only']).status, 0);
  const refreshed = fs.readFileSync(files.vaultPath('first'));
  assert.notDeepEqual(refreshed, originalFirst);
  assert.equal(decryptGuide(refreshed, 'frontend/first').toString('utf8'), updated);
  assert.deepEqual(fs.readFileSync(files.vaultPath('second')), originalSecond);
  assert.deepEqual(fs.readFileSync(files.indexPath), originalIndex);
  assert.equal(files.run(['--changed-only']).status, 0);
  assert.deepEqual(fs.readFileSync(files.vaultPath('first')), refreshed, 'Repeat refresh must not churn the ciphertext');
  assert.deepEqual(fs.readFileSync(files.indexPath), originalIndex);
});

test('changed-only refuses a wrong encryption key before changing any guide or manifest', t => {
  const files = fixture(t);
  const originals = [files.vaultPath('first'), files.vaultPath('second'), files.indexPath].map(file => [file, fs.readFileSync(file)]);
  fs.writeFileSync(files.sourcePath('first'), '# Updated source\n');
  const result = files.run(['--changed-only'], 'b'.repeat(64));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot authenticate the existing vault/);
  for (const [file, bytes] of originals) assert.deepEqual(fs.readFileSync(file), bytes);
});

test('changed-only validates every existing header before writing any earlier changed guide', t => {
  const files = fixture(t);
  const corrupt = fs.readFileSync(files.vaultPath('second'));
  corrupt[4] = 2;
  fs.writeFileSync(files.vaultPath('second'), corrupt);
  const originals = [files.vaultPath('first'), files.vaultPath('second'), files.indexPath].map(file => [file, fs.readFileSync(file)]);
  fs.writeFileSync(files.sourcePath('first'), '# Updated source\n');
  const result = files.run(['--changed-only']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid SBV1 header/);
  for (const [file, bytes] of originals) assert.deepEqual(fs.readFileSync(file), bytes);
});

test('vault encryption rejects non-hex keys before overwriting existing ciphertext', t => {
  const files = fixture(t);
  const originals = [files.vaultPath('first'), files.vaultPath('second'), files.indexPath].map(file => [file, fs.readFileSync(file)]);
  const result = files.run([], 'z'.repeat(64));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /64 hex chars/);
  for (const [file, bytes] of originals) assert.deepEqual(fs.readFileSync(file), bytes);
});

test('changed-only authenticates a valid empty guide without rewriting it', t => {
  const files = fixture(t);
  fs.writeFileSync(files.sourcePath('empty'), '');
  assert.equal(files.run().status, 0);
  const original = fs.readFileSync(files.vaultPath('empty'));
  assert.equal(original.length, 81);
  assert.equal(files.run(['--changed-only']).status, 0);
  assert.deepEqual(fs.readFileSync(files.vaultPath('empty')), original);
});

test('changed-only rejects unreadable source entries before refreshing guides or publishing a new manifest', t => {
  const files = fixture(t);
  const originals = [files.vaultPath('first'), files.vaultPath('second'), files.indexPath].map(file => [file, fs.readFileSync(file)]);
  fs.writeFileSync(files.sourcePath('first'), '# Updated source\n');
  fs.mkdirSync(files.sourcePath('unreadable'));
  assert.notEqual(files.run(['--changed-only']).status, 0);
  for (const [file, bytes] of originals) assert.deepEqual(fs.readFileSync(file), bytes);
});

test('changed-only rejects a corrupt manifest before refreshing a guide', t => {
  const files = fixture(t);
  const corrupt = fs.readFileSync(files.indexPath);
  corrupt[corrupt.length - 1] ^= 1;
  fs.writeFileSync(files.indexPath, corrupt);
  const originals = [files.vaultPath('first'), files.vaultPath('second'), files.indexPath].map(file => [file, fs.readFileSync(file)]);
  fs.writeFileSync(files.sourcePath('first'), '# Updated source\n');
  const result = files.run(['--changed-only']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest verification failed/);
  for (const [file, bytes] of originals) assert.deepEqual(fs.readFileSync(file), bytes);
});

test('encryption failures return an error without publishing a dangling manifest entry', t => {
  const files = fixture(t);
  const originalIndex = fs.readFileSync(files.indexPath);
  fs.mkdirSync(files.sourcePath('unreadable'));
  const result = files.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest was not changed/);
  assert.deepEqual(fs.readFileSync(files.indexPath), originalIndex);
});
