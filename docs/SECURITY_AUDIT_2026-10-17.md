# SkillBun security audit — 17 October 2026

## Scope and method

Audited the local v2.10.69 checkout, starting from clean commit `1692601b`. Inventoried 43 API route files and reviewed authentication, authorization, certification transactions, Firestore rules, input and body handling, sensitive response caching, secret exposure, dependencies, SMTP transport, HTML rendering, filesystem access, and outbound fetch boundaries. Applied the security-expert, audit-and-harden-security, web-security-owasp, and firebase-security-rules-auditor skills.

This report records the source audit and release preflight for v2.10.70. Production Firestore rules were deployed on 17 October 2026 and their published source was verified to exactly match this checkout on 18 October. App release status is recorded separately by the Git commit and Vercel deployment metadata. No production accounts, certificates, email recipients, or secrets were modified by this audit.

## Confirmed issues patched

| Issue | Before | Patch and evidence |
| --- | --- | --- |
| Unbounded request buffering | 28 route files called `request.json()` or `request.text()` before applying any meaningful body limit. Checking string length after buffering did not bound memory use. Signup bounded bytes but had no read deadline. | Added `utils/server/requestBody.mjs` and integrated it across all body-consuming route handlers and signup. Reads stop at the byte budget, cancel oversized streams, and have a 10-second deadline. Tests cover false/missing Content-Length, multibyte chunks, aborts, stalled cancellation, invalid JSON, and rejected AI payloads without provider calls. |
| Duplicate active roadmap certificates | Two distinct passing attempts could each mint a certificate for the same student and roadmap. The old guard covered only repeated minting of one attempt. | Minting now checks active certificates transactionally and reads/writes the existing per-roadmap attempt-history document as a shared concurrency guard. Sequential, parallel, legacy-record and revoked-record tests cover the boundary. An actual Firestore emulator transaction race produces one certificate and rejects the competing mint. Eligibility also recognizes active legacy certificates with an absent/null revocation field. |
| Profile deletion bypassed metadata preservation | Owners could delete their profile and recreate it without server-controlled fields that ordinary updates correctly protected. | Direct client profile deletion is denied, including client-admin deletion. The authenticated server account-erasure workflow remains available. Emulator tests prove profile updates preserve metadata and direct deletion/replacement fails. |
| Production quota enforcement could fall back to isolated memory | Callers that omitted `requireDistributed` could receive fresh per-instance allowances during a Redis/Firestore outage. | Shared rate limiting is now the production default. Redis-to-Firestore fallback remains; offline development retains memory fallback. Outage tests prove production requests fail closed. Human verification returns a controlled 503 without issuing proof or calling Turnstile. |
| SMTP could authenticate without STARTTLS on submission ports | Non-465 SMTP connections used opportunistic STARTTLS. A server that omitted or stripped STARTTLS could lead to cleartext authentication. | The mail transport now requires TLS. A local synthetic SMTP server advertises AUTH but rejects STARTTLS; the test confirms that no AUTH command is sent. |
| Decrypted guide responses allowed browser caching | Authenticated markdown responses allowed one hour of private caching, permitting reuse without another server authentication check. | Successful guide responses now use private/no-store browser and CDN headers. A route-level test verifies that guests cannot trigger decryption and authenticated responses contain the expected markdown and no-store headers. Existing encrypted storage and decryption format are preserved. |

Body budgets are 100,000 bytes by default, 20,000 bytes for signup, 1,000,000 bytes for the admin custom-email endpoint, and 400,000 bytes for AI conversations while preserving their existing 100,000-character limit. Draft preparation retains its existing 2,048-character limit with an 8,192-byte stream cap. Existing JSON handlers retain their 400 rejection responses; the AI and draft handlers also distinguish 408/413 body failures.

## Dependencies and secrets

- `npm audit --omit=dev`: **0 reported vulnerabilities**.
- Firebase signup function dependency audit: **0 reported vulnerabilities**.
- Full application `npm audit`: **5 high findings**, all from the development lint chain: `eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`.
- The underlying advisory is [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), concerning deeply nested brace patterns. The registry's latest `braces` release remains `3.0.3`, which is affected. There is no published compatible fix. npm suggests downgrading `eslint-config-next` to 14.2.35; that incompatible downgrade was not applied. These findings remain open and must not be described as resolved.
- Pattern-based secret scan inspected 622 tracked text files from the 3,971-file starting checkout. Matches were confined to synthetic test fixtures. No matching private keys, provider keys, live JWTs, or public-prefixed server secrets were identified. Binary assets/encrypted content were excluded. This is not a full historical entropy scan.
- A filename check of Git history found no tracked `.env`, `.env.local`, `.env.production`, private-key, or Admin SDK credential files matching the checked patterns.
- No request upload/multipart handlers or user-controlled shell execution were found. Runtime filesystem content is read from constrained static/encrypted paths. Outbound services use fixed or server-configured destinations; the public-web helper fetches a fixed search endpoint rather than arbitrary submitted URLs.

## Verification

Verification was performed with Node 22.23.3. Local logs and probe output are disposable artifacts under `.codex-tmp/security-oct17/` and must not be committed.

- Baseline: 613 tests passed.
- Updated unit/security suite: **626/626 passed**.
- ESLint, production build, template immutability guard, and `git diff --check`: **passed**.
- Local HTTP probes: **50/50 passed** against `http://localhost:3000`, covering homepage security headers, blocked plaintext/question-bank URLs, unauthenticated API rejection, administrative operations without credentials, oversized bodies, and a malicious search query. These probes did not submit valid email dispatches or authenticated data mutations.
- Firestore emulator: **23/23 passed**, including owner/admin/guest boundaries, profile preservation, server-only exam data, and an actual concurrent certificate-mint race. It ran only against `demo-skillbun-rules` on localhost and was shut down afterward.
- Synthetic SMTP TLS downgrade test passed without sending an email.
- Frozen document templates and brand assets passed the immutability guard.
- A final independent review of the concurrency, rules, bounded-body, and quota patches found no blocking defect; its additional 48 focused tests passed.
- Release continuation on 18 October: the full 626-test suite passed again; the runtime audit remains clean and the full audit still reports the five development-only findings. A read-only review of all 53 staged source/test/package files found no release blocker or matching credential patterns in staged additions.
- Production Firestore source matches local `firestore.rules`: ruleset `339c6a0f-ec7a-497f-84ac-beb6dd5a84bd`, published `2026-10-17T16:34:01.273746Z`.

## Deployment and configuration steps

1. App release version `2.10.70` hai; `package.json` aur lockfile dono increment kiye gaye hain. Deployment ko release commit, Vercel production state aur live HTTP probes se verify karein.
2. Updated Firestore rules production project `skillbun-75d10` par deploy ho chuke hain; published source match bhi verify hua hai. Is release ke rules dobara deploy karne ki zaroorat nahi hai.
3. Existing Redis/Upstash or Firebase Admin/Firestore configuration reachable rakhein. Production protected endpoints ab shared rate-limit storage unavailable hone par request reject karenge. No new environment variable is required.
4. Existing Zoho SMTP configuration retain karein. Port 465 uses TLS; a configured submission port such as 587 must support STARTTLS. Do not disable the TLS requirement to work around a mail error.
5. Deploy ke baad controlled checks karein: sign-in, guide access, certification start/submit/mint, and one authorized SMTP delivery. This audit did not send live email or issue a production certificate.
6. Standard Firebase Auth is the configured production policy (`FIREBASE_AUTH`); no blocking function is registered. Existing verified-email application/rules guards remain required. Identity Platform and its signup blocking function are optional, as documented in `OPERATIONS.md`; this release does not enable that paid service.

## Limits and rulebook pass

The review does not establish live IAM, backup restoration, provider uptime, SMTP deliverability, or deployed signup-hook enforcement. The known lint dependency advisory remains unresolved. Existing policy intentionally counts abandoned exams against the daily start quota, while the one-hour cooldown counts authoritative failed grades; that policy was preserved.

Only security behavior, its regression tests, and this report were changed. SkillBun branding, splash/loading experience, homepage hero/floaters, footer, frozen certificate designs, navigation, and dark/light theme wiring were preserved. Authentication, APIs, certification and abuse prevention were intentionally handled as described; roadmap curriculum and external-service credentials were not changed. The existing local preview is `http://localhost:3000`.
