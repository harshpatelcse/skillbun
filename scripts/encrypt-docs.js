/**
 * SkillBun Vault Encryption System (SBV1)
 * 
 * Custom encryption format with SkillBun-specific hardening layers:
 * 
 * FILE FORMAT (.sbv):
 * ┌─────────────────────────────────────────────┐
 * │ Magic Header  "SBV1"          (4 bytes)     │
 * │ Format Version                (1 byte)      │
 * │ Key Derivation Salt           (16 bytes)    │
 * │ IV / Nonce                    (12 bytes)    │
 * │ Auth Tag                      (16 bytes)    │
 * │ Content Hash (SHA-256)        (32 bytes)    │
 * │ Encrypted Payload             (variable)    │
 * └─────────────────────────────────────────────┘
 * 
 * UNIQUE SECURITY LAYERS:
 * 1. Per-file HKDF key derivation — master key + file identity = unique key per file
 * 2. Obfuscated filenames — SHA-256 hash of slug/topicId instead of plaintext names
 * 3. Content integrity hash — verifies decryption produced correct output
 * 4. Magic header — files are identifiable as SBV format but useless without key
 * 5. XOR content scramble — additional byte-level scramble before AES (defense in depth)
 * 
 * Usage:
 *   node scripts/encrypt-docs.js
 *   node scripts/encrypt-docs.js --missing-only (preserve existing ciphertext)
 *   node scripts/encrypt-docs.js --changed-only (refresh changed guides without vault churn)
 * 
 * Requires DOCS_ENCRYPTION_KEY in .env (64-char hex string = 32 bytes).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const ENCRYPTION_KEY = process.env.DOCS_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
  console.error('ERROR: DOCS_ENCRYPTION_KEY must be set in .env (64 hex chars = 32 bytes)');
  process.exit(1);
}

const MASTER_KEY = Buffer.from(ENCRYPTION_KEY, 'hex');
const MAGIC_HEADER = Buffer.from('SBV1'); // SkillBun Vault v1
const FORMAT_VERSION = 0x01;

const SOURCE_DIR = path.join(__dirname, '..', 'public', 'data', 'docs');
const TARGET_DIR = path.join(__dirname, '..', 'content', 'docs');
const MISSING_ONLY = process.argv.includes('--missing-only');
const CHANGED_ONLY = process.argv.includes('--changed-only');
if (MISSING_ONLY && CHANGED_ONLY) {
  throw new Error('Choose either --missing-only or --changed-only. No files were changed.');
}

// SkillBun secret pepper — XOR scramble pattern (adds custom layer on top of AES)
const SB_PEPPER = Buffer.from('SkillBunVault2026!HopIntoSecurity@SBV1#Pepper$Key%Guard', 'utf8');

/**
 * Derive a unique per-file key using HKDF (HMAC-based Key Derivation).
 * Each file gets its own AES key derived from master key + file identity.
 */
function deriveFileKey(masterKey, salt, fileIdentity) {
  // HKDF-Extract: PRK = HMAC(salt, masterKey)
  const prk = crypto.createHmac('sha256', salt).update(masterKey).digest();
  // HKDF-Expand: OKM = HMAC(PRK, info || 0x01)
  const info = Buffer.from(`sbv1:studyguide:${fileIdentity}`, 'utf8');
  const okm = crypto.createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest();
  return okm; // 32 bytes = AES-256 key
}

/**
 * XOR scramble — custom byte-level transformation before AES.
 * Uses a rotating pepper pattern. Reversible with same function.
 */
function xorScramble(data) {
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ SB_PEPPER[i % SB_PEPPER.length] ^ ((i * 7 + 13) & 0xFF);
  }
  return result;
}

/**
 * Generate obfuscated filename from slug + topicId.
 * GitHub clone won't reveal which file maps to which topic.
 */
function obfuscateFilename(slug, topicId) {
  return crypto.createHash('sha256')
    .update(`sbv1:${slug}/${topicId}`)
    .digest('hex')
    .slice(0, 24); // 24-char hex = 96 bits, enough uniqueness
}

/**
 * Encrypt a single file using SBV1 format.
 */
function encryptFile(inputPath, outputPath, fileIdentity) {
  const plaintext = fs.readFileSync(inputPath);

  // Layer 1: Content hash for integrity verification after decryption
  const contentHash = crypto.createHash('sha256').update(plaintext).digest();

  // Layer 2: XOR scramble (custom SkillBun transformation)
  const scrambled = xorScramble(plaintext);

  // Layer 3: Per-file key derivation
  const salt = crypto.randomBytes(16);
  const fileKey = deriveFileKey(MASTER_KEY, salt, fileIdentity);

  // Layer 4: AES-256-GCM encryption
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, iv);
  const encrypted = Buffer.concat([cipher.update(scrambled), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Assemble SBV1 file format
  const output = Buffer.concat([
    MAGIC_HEADER,                    // 4 bytes: "SBV1"
    Buffer.from([FORMAT_VERSION]),   // 1 byte: version
    salt,                            // 16 bytes: HKDF salt
    iv,                              // 12 bytes: AES-GCM nonce
    authTag,                         // 16 bytes: GCM auth tag
    contentHash,                     // 32 bytes: SHA-256 of original
    encrypted,                       // variable: ciphertext
  ]);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, output);
  return true;
}

/**
 * Build the filename mapping index (slug/topicId → obfuscated hash).
 * Encrypted and stored separately so the API can look up files.
 */
function buildIndex(mappings) {
  const indexJson = JSON.stringify(mappings);
  const plaintext = Buffer.from(indexJson, 'utf8');
  const scrambled = xorScramble(plaintext);
  const salt = crypto.randomBytes(16);
  const fileKey = deriveFileKey(MASTER_KEY, salt, 'sbv1:index:manifest');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, iv);
  const encrypted = Buffer.concat([cipher.update(scrambled), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    MAGIC_HEADER,
    Buffer.from([FORMAT_VERSION]),
    salt, iv, authTag,
    encrypted,
  ]);
}

function authenticateExisting(filePath, fileIdentity, isIndex = false) {
  const existing = fs.readFileSync(filePath);
  const payloadOffset = isIndex ? 49 : 81;
  if (existing.length < payloadOffset || existing.subarray(0, 4).toString('ascii') !== 'SBV1' || existing[4] !== FORMAT_VERSION) {
    throw new Error('An existing vault file has an invalid SBV1 header. No files were changed.');
  }
  const fileKey = deriveFileKey(MASTER_KEY, existing.subarray(5, 21), fileIdentity);
  const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey, existing.subarray(21, 33));
  decipher.setAuthTag(existing.subarray(33, 49));
  let plaintext;
  try {
    plaintext = xorScramble(Buffer.concat([decipher.update(existing.subarray(payloadOffset)), decipher.final()]));
  } catch {
    throw new Error('The configured key cannot authenticate the existing vault. No files were changed.');
  }
  const contentHash = crypto.createHash('sha256').update(plaintext).digest();
  if (!isIndex && !contentHash.equals(existing.subarray(49, 81))) {
    throw new Error('An existing vault file failed its content integrity check. No files were changed.');
  }
  return { plaintext, contentHash };
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error('Source directory not found:', SOURCE_DIR);
    process.exit(1);
  }

  const slugDirs = fs.readdirSync(SOURCE_DIR).filter(d =>
    fs.statSync(path.join(SOURCE_DIR, d)).isDirectory()
  );

  console.log(`\n🔐 SkillBun Vault Encryption System (SBV1)\n`);
  console.log(`Found ${slugDirs.length} roadmap doc folders\n`);

  const mappings = {}; // slug/topicId → obfuscated hash
  let total = 0;
  let success = 0;
  let preserved = 0;
  const existingHashes = new Map();
  const sourceHashes = new Map();
  let existingIndex = null;

  if (CHANGED_ONLY) {
    // Read the sources and authenticate every corresponding guide and manifest
    // before any write, so malformed inputs cannot leave a partial refresh.
    for (const slug of slugDirs) {
      for (const file of fs.readdirSync(path.join(SOURCE_DIR, slug)).filter(file => file.endsWith('.md'))) {
        const identity = `${slug}/${file.replace('.md', '')}`;
        sourceHashes.set(identity, crypto.createHash('sha256').update(fs.readFileSync(path.join(SOURCE_DIR, slug, file))).digest());
        const hash = obfuscateFilename(slug, file.replace('.md', ''));
        const existingPath = path.join(TARGET_DIR, hash.slice(0, 2), `${hash}.sbv`);
        if (fs.existsSync(existingPath)) existingHashes.set(identity, authenticateExisting(existingPath, identity).contentHash);
      }
    }
    const indexPath = path.join(TARGET_DIR, '_index.sbv');
    if (fs.existsSync(indexPath)) {
      try {
        existingIndex = JSON.parse(authenticateExisting(indexPath, 'sbv1:index:manifest', true).plaintext.toString('utf8'));
        if (!existingIndex || typeof existingIndex !== 'object' || Array.isArray(existingIndex)) {
          throw new Error('The manifest must contain a guide mapping object');
        }
      } catch (error) {
        throw new Error(`Existing vault manifest verification failed: ${error.message}. No files were changed.`);
      }
    }
  }

  if (MISSING_ONLY) {
    // Authenticate an existing file before writing anything so a wrong local
    // key cannot create a mixed-key vault while restoring missing guides.
    let verified = false;
    for (const slug of slugDirs) {
      for (const file of fs.readdirSync(path.join(SOURCE_DIR, slug)).filter(file => file.endsWith('.md'))) {
        const identity = `${slug}/${file.replace('.md', '')}`;
        const hash = obfuscateFilename(slug, file.replace('.md', ''));
        const existingPath = path.join(TARGET_DIR, hash.slice(0, 2), `${hash}.sbv`);
        if (!fs.existsSync(existingPath)) continue;
        try {
          const existing = fs.readFileSync(existingPath);
          const fileKey = deriveFileKey(MASTER_KEY, existing.subarray(5, 21), identity);
          const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey, existing.subarray(21, 33));
          decipher.setAuthTag(existing.subarray(33, 49));
          decipher.update(existing.subarray(81));
          decipher.final();
          verified = true;
        } catch {
          throw new Error('The configured key cannot authenticate the existing vault. No files were changed.');
        }
        break;
      }
      if (verified) break;
    }
  }

  for (const slug of slugDirs) {
    const slugDir = path.join(SOURCE_DIR, slug);
    const files = fs.readdirSync(slugDir).filter(f => f.endsWith('.md'));
    if (files.length === 0) continue;

    console.log(`🔒 Encrypting: ${slug} (${files.length} files)`);

    for (const file of files) {
      const topicId = file.replace('.md', '');
      const fileIdentity = `${slug}/${topicId}`;
      const obfuscatedName = obfuscateFilename(slug, topicId);
      const inputPath = path.join(slugDir, file);
      const outputPath = path.join(TARGET_DIR, obfuscatedName.slice(0, 2), `${obfuscatedName}.sbv`);

      total++;
      mappings[fileIdentity] = obfuscatedName;

      try {
        if (MISSING_ONLY && fs.existsSync(outputPath)) {
          preserved++;
          success++;
          continue;
        }
        if (CHANGED_ONLY) {
          if (existingHashes.get(fileIdentity)?.equals(sourceHashes.get(fileIdentity))) {
            preserved++;
            success++;
            continue;
          }
        }
        encryptFile(inputPath, outputPath, fileIdentity);
        success++;
      } catch (err) {
        console.error(`  ✗ FAIL: ${file} — ${err.message}`);
      }
    }
  }

  if (success !== total) {
    console.error(`Encryption failed for ${total - success} file(s). The manifest was not changed.`);
    process.exitCode = 1;
    return;
  }

  // Write encrypted index
  const indexPath = path.join(TARGET_DIR, '_index.sbv');
  if (!fs.existsSync(TARGET_DIR)) fs.mkdirSync(TARGET_DIR, { recursive: true });
  const sameMappings = CHANGED_ONLY && existingIndex &&
    Object.keys(existingIndex).length === Object.keys(mappings).length &&
    Object.entries(mappings).every(([identity, hash]) => existingIndex[identity] === hash);
  if (!sameMappings) fs.writeFileSync(indexPath, buildIndex(mappings));

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  SkillBun Vault Encryption Complete`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`  Total files:  ${total}`);
  console.log(`  Encrypted:    ${success}`);
  console.log(`  Failed:       ${total - success}`);
  if (MISSING_ONLY || CHANGED_ONLY) {
    console.log(`  Preserved:    ${preserved}`);
    console.log(`  ${CHANGED_ONLY ? 'Refreshed' : 'Added'}:    ${success - preserved}`);
  }
  console.log(`  Index:        _index.sbv (encrypted manifest)`);
  console.log(`  Format:       SBV1 (AES-256-GCM + HKDF + XOR + SHA-256)`);
  console.log(`  Filenames:    Obfuscated (SHA-256 hash, sharded)`);
  console.log(`${'═'.repeat(50)}\n`);

  if (success === total) {
    console.log('✅ All files encrypted with SkillBun Vault protection!');
  }
}

main();
