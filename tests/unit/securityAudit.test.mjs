import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema, validatePlainObject, validateString, SQL_INJECTION_PATTERNS } from '../../utils/server/inputValidator.js';
import { generateCertificateId, generateWorkforceId, WORKFORCE_PREFIXES, isValidCertificateId } from '../../utils/server/workforceId.js';

test('SkillBun Security Hardening & Input Defense Suite', async (t) => {
  await t.test('Universal SQL Injection Regex Defense', () => {
    const maliciousPayloads = [
      "' or '1'='1",
      "admin' --",
      "admin' #",
      '1 --',
      '1 #',
      "1; DROP TABLE users;",
      "' UNION SELECT null, username, password FROM users--",
      "'; EXEC xp_cmdshell('dir');--",
      "' OR 1=1/*",
    ];

    for (const payload of maliciousPayloads) {
      const matched = SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(payload));
      assert.equal(matched, true, `Expected payload to trigger SQL injection defense: ${payload}`);
    }
  });

  await t.test('Technical language names survive injection checks in searches and profile fields', () => {
    for (const value of ['C#', 'F#', 'Learn C#', 'Python or Java', 'C++ and C#', '.NET with F#']) {
      assert.equal(validateString(value, { rejectSqlInjection: true }).isValid, true, value);
      assert.equal(validateSchema({ interest: value }, { interest: { type: 'string', required: true } }).isValid, true, value);
    }
  });

  await t.test('Prototype Pollution & Malicious Object Defense', () => {
    const pollutedPayload = JSON.parse('{"__proto__": {"admin": true}, "validField": "test"}');
    const result = validatePlainObject(pollutedPayload);
    assert.equal(result.isValid, false, 'Expected prototype pollution attempt to be rejected');
  });

  await t.test('Strict Schema Validation (validateSchema)', () => {
    const schema = {
      name: { type: 'string', required: true, minLength: 2, maxLength: 50 },
      score: { type: 'integer', required: true, min: 0, max: 100 },
      slug: { type: 'string', required: true, pattern: /^[a-z0-9_]+$/ },
    };

    // Valid case
    const valid = validateSchema(
      { name: 'John Doe', score: 85, slug: 'frontend_developer' },
      schema
    );
    assert.equal(valid.isValid, true);
    assert.equal(valid.value.score, 85);

    // Invalid score (exceeds max)
    const invalidScore = validateSchema(
      { name: 'John Doe', score: 105, slug: 'frontend_developer' },
      schema
    );
    assert.equal(invalidScore.isValid, false);

    // Invalid slug (forbidden characters)
    const invalidSlug = validateSchema(
      { name: 'John Doe', score: 85, slug: 'frontend-developer!' },
      schema
    );
    assert.equal(invalidSlug.isValid, false);

    // Unknown keys rejected when allowUnknown is false
    const extraKey = validateSchema(
      { name: 'John Doe', score: 85, slug: 'frontend_dev', extra: 'hacked' },
      schema,
      { allowUnknown: false }
    );
    assert.equal(extraKey.isValid, false);
  });

  await t.test('Cryptographic ID Generation Quality', () => {
    // Certificate tokens must exclude ambiguous characters (0, O, 1, I, L)
    const certId = generateCertificateId();
    assert.match(certId, /^SKB[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);

    // Workforce tokens must follow format: SKB-YYYY-PREFIX-CRYPTO_SUFFIX
    const internId = generateWorkforceId(WORKFORCE_PREFIXES.INTERNSHIP);
    assert.match(internId, /^SKB-\d{4}-INT-REC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  });

  await t.test('Alumni Document Verification IDOR Invariants', () => {
    // Reference code validator pattern
    const isRefCode = isValidCertificateId;

    // Valid institutional reference patterns
    assert.equal(isRefCode('SKB/2026/HR-OFF/8K29DF'), true);
    assert.equal(isRefCode('SKB-2026-INT-REC-7R35TK'), true);
    assert.equal(isRefCode(generateCertificateId()), true);
    assert.equal(isRefCode('Abc123def456ghi789JK'), true);
    assert.equal(isRefCode('SKB8F92-4C-10-9A7E/ref'), false);
    assert.equal(isRefCode('sb/victim@example.com'), false);

    // Malicious email enumeration queries MUST NOT be treated as reference codes
    assert.equal(isRefCode('victim@example.com'), false);
    assert.equal(isRefCode('admin@skillbun.tech'), false);
    assert.equal(isRefCode('ceoharshpatel@gmail.com'), false);
    assert.equal(isRefCode(''), false);
  });
});
