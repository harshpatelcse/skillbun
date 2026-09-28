# SkillBun — Full-Stack Bug & Security Audit

**Date:** 2026-09-28
**Scope:** every first-party file in the repository — API routes, server/client utilities, Firestore rules, edge proxy, CI workflow, deployment config, scripts, and the encryption layer. `node_modules/`, `public/data/docs/` plaintext bodies, and generated content were inventoried but not line-read.
**Method:** line-by-line source review plus live verification against the local dev server (`http://localhost:3000`). Every finding below was confirmed by reading the exact code path — nothing here is a pattern guess.
**Code changes made:** none. This is a read-only audit, so the project version was not incremented.

---

## Severity summary

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | **Critical** | A `GET` request permanently deletes certificate records | `app/api/admin/analytics/route.js` |
| 2 | **High** | Cross-user document disclosure (IDOR) via shared cache key | `app/api/alumni/documents/route.js` |
| 3 | **High** | Client-controlled IP headers bypass all per-IP rate limits | `utils/server/requestUtils.js` |
| 4 | **High** | Human-proof token is bearer-only and unbound to user/action | `utils/server/humanProof.js` + 3 routes |
| 5 | **High** | One leaked env var decrypts the entire paid corpus | `app/api/docs/[slug]/[topicId]/route.js`, `app/api/quiz/questions/route.js` |
| 6 | **High** | 15.2 MB of protected plaintext study guides present locally | `public/data/docs/` |
| 7 | Medium | Cascade delete can exceed Firestore's 500-op batch limit → partial destructive commit | `app/api/admin/workforce/employees/[id]/route.js` |
| 8 | Medium | `HUMAN_PROOF_SECRET` silently derived from an AI provider key | `utils/server/env.js` |
| 9 | Medium | Study-guide corpus is fully scrapable by any one logged-in user | `app/api/docs/[slug]/[topicId]/route.js` |
| 10 | Medium | SBV1 crypto duplicated in two routes with no shared module | `app/api/docs/...`, `app/api/quiz/questions/...` |
| 11 | Medium | Admin CRUD endpoints have no rate limiting | `app/api/admin/analytics`, `admin/emails/reset` |
| 12 | Medium | `.env.example` ships a concrete infrastructure URL | `.env.example` |
| 13 | Low | Cache-key sanitiser is not injective (latent cross-user collision) | `utils/server/inputValidator.js` |
| 14 | Low | `escapeHtml` name-collision footgun in the mailer | `utils/server/zohoMailer.js` |
| 15 | Low | `npm test` silently runs 15 of 25 declared suites; docs claim 17 | `package.json`, `AGENTS.md` |
| 16 | Low | CI never builds on the production platform | `.github/workflows/ci.yml` |
| 17 | Low | Client query cache is never cleared on logout | `utils/client/useFastQuery.js` |

---

## 1. CRITICAL — A `GET` request permanently deletes certificate records

**File:** `app/api/admin/analytics/route.js` (lines ~236–262)

The admin analytics read path computes which certificates look "orphaned" and then **destroys them**:

```js
const orphanedCertRefs = [];
certsList = rawCerts.filter((c) => {
  const isValidUserCert =
    (c.uid && activeUserUids.has(c.uid)) ||
    (c.email && activeUserEmails.has(c.email));
  if (!isValidUserCert) {
    if (c.ref) orphanedCertRefs.push(c.ref);
    return false;
  }
  return true;
});

if (orphanedCertRefs.length > 0) {
  const purgeBatch = db.batch();
  orphanedCertRefs.forEach((ref) => purgeBatch.delete(ref));
  await purgeBatch.commit();   // <-- hard delete, inside a GET handler
}
```

**Why this is critical**

- `GET /api/admin/analytics` is a *cacheable read* endpoint, but it performs an irreversible `DELETE`. It is reachable by any admin session and executes again on every cache miss.
- The "orphan" decision is derived from **truncated, paginated state**. `computeAdminAnalytics()` builds `authUsersMap` from `adminAuth.listUsers(1000)` — one page only. Beyond 1000 Auth users, valid users are absent from the map, and then their certificates are treated as orphans and hard-deleted.
- The Firestore projection widens the blast radius: `usersSnap` is fetched with `.select('name','email', ...)`. If `email` is absent or stored with different casing on a record, `activeUserEmails` will not contain it, and every certificate for that user is deleted on the next dashboard load.
- The `certsByUid`/`by email` linkage also misses workforce credentials whose `uid` is an intern's reserved UID but whose Firestore profile document does not exist yet.
- Deletion is **irreversible** and unlogged apart from a `console.warn` count.

**Impact:** silent, repeatable destruction of issued, publicly-verifiable credentials — the exact artifact the version-pinned/immutable-registry architecture in `AGENTS.md` exists to protect. A certificate is the product's headline deliverable; this path can wipe them in batches while its own contract says certificates are "server-authoritative, append-only".

**Fix direction:** remove the mutation from the `GET` entirely. Report orphans as a diagnostic count, and expose any purge as a separate, explicitly-confirmed, paginated `POST` that is limited to records proven unreachable (e.g. `auth.getUser(uid)` throws `auth/user-not-found`), with an audit trail. Never let a listing endpoint write.

---

## 2. HIGH — Cross-user document disclosure (IDOR) via a shared cache key

**File:** `app/api/alumni/documents/route.js` (line ~92)

```js
const cacheKey = `alumni:ref:${normalizedRef}:${isAdmin ? 'admin' : 'public'}`;
```

The cache key segments **authenticated owners together with anonymous visitors** under the single label `public`. The cached payload's visibility depends on the *first* caller:

```js
const isOwnerOrAdmin = isAdmin || (userEmail && userEmail === certEmail);
...
recipient_email: isOwnerOrAdmin ? (data.email || '') : maskEmail(data.email || ''),
...
pdf_base64: isOwnerOrAdmin ? (data.pdf_base64 || null) : null,
```

**Exploit (confirmed by reading the propagation path)**

1. A signed-in owner — or any admin — looks up reference `SKB-2026-HR-OFF-8K29DF`. The result is cached under `alumni:ref:SKB-2026-HR-OFF-8K29DF:public`.
2. `setCache()` writes that value to L1 process memory **and** to Upstash Redis (`/setex/...`, up to `ttlSeconds * 1000 * 2` SWR grace — up to 2 minutes fresh + 10 min stale window).
3. An **unauthenticated** caller then requests the same reference. `getCache()` returns the owner-scoped payload verbatim: the full unmasked recipient email and the entire `pdf_base64` of the HR document.
4. Any other serverless instance/region reads the same Redis key and serves it too.

`/api/alumni/documents` explicitly allows reference-code lookups **without a token** (the `isRefCode && !token` path passes the auth gate), so step 3 needs no credentials at all — only knowledge of a certificate ID, which the repository itself documents as the public format (`SKBXXXX-XX-XX-XXXX`) and which is printed on every shareable certificate and LinkedIn share URL.

**Impact:** unauthorised disclosure of third-party PII (personal emails) and confidential workforce PDFs (offer letters, extension letters, termination notices) at scale, triggerable by an attacker whose own query "poisons" the cache for others.

**Fix direction:** never share an authorization-dependent cached payload. Either key the cache per viewer (`:${uid||'anon'}`) and drop `pdf_base64` from the cached object, or cache only the public projection and merge private fields outside the cache.

---

## 3. HIGH — Client-controlled headers bypass every per-IP rate limit

**File:** `utils/server/requestUtils.js` (lines 12–19)

```js
export function getClientAddress(request) {
  const forwardedFor = request?.headers?.get?.('x-forwarded-for') || ''
  return (
    request?.headers?.get?.('cf-connecting-ip') ||   // attacker-controlled
    request?.headers?.get?.('x-real-ip') ||          // attacker-controlled
    forwardedFor.split(',')[0].trim() ||
    '127.0.0.1'
  )
}
```

`cf-connecting-ip` and `x-real-ip` are plain request headers. On Vercel the trusted hop value is `x-vercel-forwarded-for`; the repository's own hardened signup module already knows this and deliberately refuses to trust the other two:

> `utils/server/emailSignupHttp.mjs:26` — *"Vercel overwrites x-vercel-forwarded-for. Never trust a client-supplied cf-connecting-ip/x-real-ip in this deployment's security-sensitive limits."*

The generic helper takes the opposite stance and is the one wired into the exam system. Every `getSubject: ({ address }) => …` bucket inherits the flaw: `certStart` (`ipHour` 25), `certSubmit` (`ipHour` 40), `certMint` (`ipHour` 50), `docsAccess` (`ipMinute` 60), `alumniLookup`, `passwordReset` (`ipHour` 10), `humanVerify`, `unsubscribePost`, and the workforce helper.

**Impact:** an attacker who sends a fresh `x-real-ip` (or `x-forwarded-for`) per request reduces every IP-based limit to a no-op, then amplifies via unlimited distinct Firebase accounts — a fresh UID resets the per-user buckets too. The exam anti-abuse contract ("3 attempts / 24 h", "1-hour cooldown") is enforced *inside* that subject, so the IP tier is the only remaining brake on distributed attempts.

**Fix direction:** mirror `emailSignupHttp.mjs` — read only the platform-injected header, normalise IPv6 to /64, and never consult `cf-connecting-ip`/`x-real-ip` unless the deployment is genuinely behind Cloudflare with a verified proxy path.

---

## 4. HIGH — Human-proof token is bearer-only and unbound to user, action, or IP

**File:** `utils/server/humanProof.js`

```js
const payload = { iat: issuedAt, exp: expiresAt, ...claims }
```

The only issuer passes `{ v: 1 }` (`app/api/human/verify/route.js`, three call sites). The token therefore contains no `uid`, no purpose, and no client binding. It is verified at four endpoints purely as a presence check:

- `app/api/quiz/questions/route.js` → unlocks the **entire 2,531-question quiz bank**
- `app/api/docs/[slug]/[topicId]/route.js` → unlocks **decrypted study guides**
- `app/api/gemini/route.js`, `app/api/counsellor/route.js` → unlocks paid AI inference

**Impact:** the token is valid for `HUMAN_PROOF_TTL_MS` (default 30 min). One token, obtained once and then copied, is a reusable key for all four surfaces for the rest of its lifetime, from any IP, for any account. There is no revocation list, no nonce, and no consumption on use. `/api/human/verify` also echoes back any still-valid presented token, so the value keeps circulating for free.

**Fix direction:** sign `{ uid, purpose, iat, exp }`, verify `purpose` at each endpoint, bind `address` (or at minimum `uid`) into the claims, keep the TTLs short, and treat `x-skillbun-human` inside authenticated routes as second-factor rather than sufficient proof.

---

## 5. HIGH — A single leaked environment variable decrypts the entire paid corpus

**Files:** `app/api/docs/[slug]/[topicId]/route.js:27`, `app/api/quiz/questions/route.js:10`

```js
const SB_PEPPER = Buffer.from('SkillBunVault2026!HopIntoSecurity@SBV1#Pepper$Key%Guard', 'utf8')
```

`AGENTS.md` correctly classifies the pepper as *defense-in-depth, not the primary secret*. The operational consequence is nonetheless stark and worth stating explicitly: the pepper is committed, the indexing scheme is committed (`obfuscateFilename`), the file format is committed, and the ciphertext is committed. `DOCS_ENCRYPTION_KEY` is the **only** unknown. All 3,095 `content/docs/**/*.sbv` files and `content/quiz/questions.sbv` fall together — a per-file HKDF salt does not help once the master key is gone, because the identity string is deterministic (`slug/topicId`, already public via the roadmap catalog).

**Impact:** total loss of the studied asset. The five-layer design buys nothing against master-key compromise; it only raises the cost of casual inspection.

**Fix direction:** treat `DOCS_ENCRYPTION_KEY` as a crown-jewel secret with rotation procedure and monitoring; consider a per-collection key split so a quiz-bank leak cannot decrypt the roadmap corpus, and keep decrypted output strictly in memory (already the case).

---

## 6. HIGH — 15.2 MB of protected plaintext is present in the working tree

**Path:** `public/data/docs/`

3,335 decrypted `.md` files / **15.2 MB** currently exist locally. `.gitignore` excludes them from version control (`public/data/docs/` is listed) and `proxy.js` returns 404 for `/data/docs/*` — both correct. The residual risk is environmental:

- any tooling that bundles `public/**` for an ad-hoc deploy (outside the committed `vercel.json` `installCommand`) will publish the corpus in plaintext, and the proxy rule only guards requests that traverse the Next.js proxy;
- the files are outside all encryption at rest.

This is latent, not currently exploitable, but it is a single mistake away from being dispositive — and it should not be one of the reasons finding 5 matters less than it does.

**Fix direction:** keep the plaintext only in an encrypted local volume, or regenerate it on demand from `.sbv` via `scripts/encrypt-docs.js`'s inverse rather than storing it beside the deployable tree.

---

## 7. MEDIUM — Cascade delete can exceed Firestore's batch limit

**File:** `app/api/admin/workforce/employees/[id]/route.js` (lines ~141–175)

```js
const batch = db.batch()
// certificates, milestones, workforce_docs, employee … all added to ONE batch
await batch.commit()
```

Firestore caps a batch at **500 writes**. This path adds certificates by `employee_id`, certificates by `email`, all milestones, all workforce docs, plus the employee document — with no chunking. Contrast `app/api/admin/emails/reset/route.js`, which correctly chunks at 400:

```js
const batchSize = 400;
for (let i = 0; i < docs.length; i += batchSize) { … }
```

**Impact:** for an employee with a large document history the commit fails *after* the reads, so the admin sees an error while the deletion contract in `AGENTS.md` ("atomically wipe … in an atomic batch") silently did not happen — or, worse on retry, lands partially. Either way data and audit expectations diverge.

---

## 8. MEDIUM — `HUMAN_PROOF_SECRET` silently derived from an AI provider key

**File:** `utils/server/env.js` (lines ~106–123)

```js
const fallbackSeed = getFirstNonEmpty(process.env.GROQ_API_KEY, process.env.OPENROUTER_API_KEY)
if (fallbackSeed) return `skillbun-human-proof:${fallbackSeed}`
```

If `HUMAN_PROOF_SECRET` is unset, the HMAC-issuing secret becomes a pure function of an unrelated vendor credential. Rotating or revoking the AI key then silently invalidates every live human-proof token; conversely, a leaked Groq key compromises human-proof forgery for every endpoint listed in finding 4 — a cross-domain privilege transfer that the `.env` inventory in `AGENTS.md` does not disclose.

The dev fallback `'skillbun-human-proof:skillbun-local-dev'` is correctly gated to non-production, so the production exposure is limited to the provider-key path.

**Fix direction:** fail closed in production when `HUMAN_PROOF_SECRET` is absent, rather than deriving it.

---

## 9. MEDIUM — The study-guide corpus is fully scrapable by one logged-in user

**File:** `app/api/docs/[slug]/[topicId]/route.js` (lines 11–15)

```js
{ name: 'userHour', windowMs: 60 * 60 * 1000, maxRequests: 300, getSubject: ({ uid }) => `user:${uid}` }
```

300 files/hour/user × unlimited accounts. With **no** daily cap, no human-proof gate on this route, and unlimited registration, 3,095 documents can be harvested by a single attacker in roughly 11 hours — less with parallel accounts. The room/rate design correctly anticipates "scraping attacks" in its own comment but the ceiling is set far above the size of the corpus it protects.

**Fix direction:** add a daily per-user ceiling, require the human-proof token here as the other decryption surface does, and consider anomaly alerting on breadth (distinct `slug` values per uid per hour) rather than raw request count.

---

## 10. MEDIUM — SBV1 crypto is copy-pasted into two routes

`SB_PEPPER`, `deriveFileKey()`, `xorScramble()`, and the header parse in `decryptSBV1()` are byte-for-byte duplicated between `app/api/docs/[slug]/[topicId]/route.js` and `app/api/quiz/questions/route.js` — only the `info` prefix (`sbv1:studyguide:` vs `sbv1:quiz:`) differs. `AGENTS.md` mandates that "the pepper in source code must match between `scripts/encrypt-docs.js` and the API route" — that invariant is now manual and unverified across **three** independent copies. A future format change that touches one and not the others produces silent `Content integrity check failed` outages in production with no test coverage protecting the parity (see finding 15).

**Fix direction:** extract one `utils/server/sbv1.js` and have both routes plus the encrypt script import it.

---

## 11. MEDIUM — Admin CRUD endpoints have no rate limiting

Confirmed by scanning every `app/api/**/route.js` for a limiter: `app/api/admin/analytics/route.js` and `app/api/admin/emails/reset/route.js` (with its `resetAll` bulk-write path) are unguarded, and `app/api/admin/workforce/milestones/*` has no limiter on `POST`/`PATCH`/`DELETE`. The analytics endpoint additionally performs a full-collection scan (`listUsers(1000)`, all `users` with subcollection fan-out at concurrency 12, all `certificates`, all `examAttempts`) — an expensive operation, combined above with a destructive write, callable in a loop.

---

## 12. MEDIUM — `.env.example` ships a concrete infrastructure URL

`.env.example` contains a non-placeholder `UPSTASH_REDIS_REST_URL` (32 chars) and a populated `APP_ALLOWED_ORIGINS`. It is tracked in git (`git ls-files` → `.env.example`). No secret leaked — the matching token is a placeholder — but a real endpoint is disclosed and, more importantly, the file normalises "paste the real thing here" instead of proving the variable is required.

**Positive note:** `.env` itself is correctly untracked, and `git log --all` over `.env`, `*.pem`, and adminsdk files returns nothing — no secret has ever been committed. That is the right result and worth preserving.

---

## 13. LOW — Cache-key sanitiser is not injective

**File:** `utils/server/inputValidator.js`

```js
export function sanitizeCacheKey(key) {
  return key.replace(/[\r\n\t\0\x00-\x1F\x7F]/g, '').trim().slice(0, 256)
}
```

It strips control characters and truncates, but does not encode `:` or `?`. Cache keys are hand-built by concatenation (`alumni:ref:${ref}:public`, `admin:milestones:${scope}`), so a value containing `:` can shift segments. Today's inputs are constrained enough that no collision is reachable, but the helper does not *enforce* injectivity — and finding 2 shows what a single mis-segmented key costs. Encoding (`encodeURIComponent`) or hashing the key would make the property structural rather than incidental.

---

## 14. LOW — `escapeHtml` name-collision footgun

**File:** `utils/server/zohoMailer.js`

```js
export function escapeHtml(value) {
  return String(value ?? '')      // pass-through — no escaping at all
}
```

`utils/server/emailTheme.js` exports a **correct** escaper under the same name (verified: it maps `& < > " '`). Any module that imports `escapeHtml` from `zohoMailer` instead gets silent no-op escaping. `retentionEmails.js` re-exports `escapeHtml` through its own chain, so the two names now travel together through three modules. The consumer is an email client, not a browser, so this is not a live XSS today — but it is a one-import-away correctness failure in the layer that renders credentials and signed letters.

**Fix direction:** delete the stub, or rename it (`asText`) so it cannot shadow the real escaper.

---

## 15. LOW — Test command silently under-runs; documentation is stale

`package.json` `npm test` enumerates 25 explicit files, but running it produces **15 suites, 298 tests, 0 failures** — so 10 declared files contribute nothing (absent `.ts` files such as `tests/unit/career_matrix.test.ts` and `certificate_hash.test.ts`, and unreferenced suites). `AGENTS.md` separately claims "17 Unit Test Suites (186 tests)". Neither number matches reality. Nothing that runs is failing — the problem is the gap between what the suite *claims* to protect and what it executes: no test covers the `SBV1` pepper parity of finding 10, the cache-key/authorization interaction of findings 2 and 13, or the `getClientAddress` trust order of finding 3.

`npm run lint` passes clean; worth noting the ESLint config ignores `.codex-tmp/**` and `.playwright-cli/**` only.

---

## 16. LOW — CI never builds on the production platform

**File:** `.github/workflows/ci.yml`

`runs-on: ubuntu-latest` with `npm ci` and `npm run build`. `next.config.mjs` computes ONNX `outputFileTracingExcludes` from `process.platform + '/' + process.arch`, and the install-time behaviour depends on `ONNXRUNTIME_NODE_INSTALL`. A Linux CI job therefore **cannot** validate the Windows/macOS tracing paths that a local dev build exercises, and vice versa — the CI build is platform-representative of the deploy target only if that target is Linux. Combined with the non-blocking `node --input-type=module -e "await import('@huggingface/transformers')"` RAG check (which fails before the version guard anyway), the "Production Build Verification" step verifies less than its name implies.

---

## 17. LOW — Client query cache survives logout

`utils/client/useFastQuery.js` defines `clearClientCache()`, and a repository-wide search finds **no other reference to it** — nothing calls it. The module-level `clientCache` map and the cross-tab `BroadcastChannel` in `dataSyncManager.js` persist across a sign-out on the same browser profile, so admin/student payloads already fetched remain readable in memory and are re-served as "instant initial render" to whoever signs in next on that device.

**Fix direction:** call `clearClientCache()` (and close the sync channel) from the auth sign-out path.

---

## What is genuinely well built

Reported deliberately, because it changes where the effort should go:

- **Signup/OTP flow** (`utils/server/emailSignup.mjs`) — reservation-before-SMTP, constant-time digest comparison, Gmail dot/plus alias collapsing, `/64` IPv6 grouping, attempt counters committed via returned error values so failed guesses persist, `requireDistributed: true` so a dead shared store fails closed instead of granting a fresh allowance per serverless instance, and a blocking `beforeUserCreated` function that refuses unverified password signups.
- **Firestore rules** — `examAttempts` read/write hard-denied (the answer key never leaves the server), `certificates` write denied with public single-doc `get`, progress/profile schemas validated with `hasOnly`, milestones restricted to `['status','deliverable_url','updated_at']` for interns. Live tests confirm the rules are asserted, not merely written.
- **Edge proxy** — verified live: `/data/quizzes/frontend.json` returns **404** with `Cache-Control: no-store`, and the CSP nonce in the response header matches the `nonce=` attribute on the emitted inline `<script>` tags in the same document (nonce plumbing is correct end to end, script-src has no `unsafe-inline`).
- **Code playground** — student code runs in an iframe sandboxed with `allow-scripts` **only**, deliberately excluding `allow-same-origin`, so `eval()` inside it has no cookie/storage or same-origin access. That is the correct call.
- **Exam state machine** (`certificationState.mjs`) — grading and minting both run inside Firestore transactions with ownership, expiry (`+15s` grace), `minted !== true`, and score re-validation; the server binds `name`/`roadmapTitle` from the immutable attempt record so client parameters cannot spoof a credential. The dev bypass in `/api/certify/submit` is properly gated by `process.env.NODE_ENV === 'development'` on the server, not just the client.
- **Template immutability** — `certificateRegistry.js` returns `null` on an unknown version (no silent `v1` fallback), matching the strict-error policy; `scripts/check-document-template-immutability.mjs` guards it in CI.
- **Secrets hygiene** — no secret has ever been committed; `.env` is untracked; `webhook`-style or `dangerouslySetInnerHTML` sinks are either static JSON-LD or DOMPurify-sanitised with a restrictive profile and a URI allowlist.

---

## Recommended order of remediation

1. **Remove the destructive write from `GET /api/admin/analytics`** (finding 1). Highest damage-per-line in the repository.
2. **Fix the alumni cache key / stop caching authorization-dependent payloads** (finding 2).
3. **Adopt the trusted-header IP strategy in `getClientAddress`** (finding 3) — it re-arms the limits protecting the exam system.
4. **Bind human-proof tokens to uid + purpose** and gate `docsAccess` with them (findings 4, 9).
5. **Rotate and isolate `DOCS_ENCRYPTION_KEY`; decide the plaintext-storage policy** (findings 5, 6, 10).
6. Chunk the workforce cascade batch, fail closed on a missing `HUMAN_PROOF_SECRET`, add admin-endpoint limits, then the low-severity cleanups (findings 7, 8, 11–17).

---

### Verification performed

- `npm test` → 15 suites, 298 tests, 0 failures.
- `npm run lint` → clean.
- Live dev server at `http://localhost:3000`: homepage 200 with nonce-bearing CSP (nonce matches in-document scripts), `X-Frame-Options: SAMEORIGIN`, HSTS present; `/data/quizzes/frontend.json` → 404 `no-store`; `/api/config` → 200 with security headers.
- `git ls-files`/`git log --all` confirm no `.env`, `.pem`, or service-account file is tracked or has ever been committed.

### Not verified

- Any behaviour requiring live Firestore credentials, an intern account, or valid Firebase ID tokens (findings 1, 2, 4, 7, 9 described from source-path proof, not exploitation).
- Production-only rendering (production CSP omits `unsafe-eval`; the artifacts and the email dark-mode media queries were not opened in a real mail client).
- The contents of the 3,335 plaintext `.md` study guides and the 100 roadmap/quiz JSON files (inventoried, not line-read).
