# SkillBun — Security Audit: Triage Decision & Execution Brief

**Date:** 2026-09-29
**Input:** `docs/SECURITY_AUDIT_FINDINGS_2026-09-28.md` (read-only audit by the audit agent, 17 findings, zero code changed)
**Author of this brief:** supervising agent (verification pass + sequencing decision)
**Purpose:** decide what happens next, and give the implementing agent an exact, scoped instruction.

---

## 0. Decision summary

The audit is **credible and the severity ranking is broadly correct**. I independently re-read the source for findings 1, 2 and 3 and reproduced all three verbatim — these are not pattern guesses.

Decision:

1. **Do not start a broad remediation.** Fix Tier 1 only (findings 1, 2, 3).
2. **Resolve the dirty working tree first** — it is the immediate blocker (see §2).
3. **Do not let the same agent that authored the audit implement the fixes.** Hand execution to the executor agent; verification stays independent.
4. **One question the audit did not ask must be answered before anything else ships:** *has the destructive `GET` purge already fired in production?*

---

## 1. Verification performed on the audit (independent of the author)

| Finding | Re-read location | Verdict |
|---|---|---|
| 1 — `GET` deletes certificates | `app/api/admin/analytics/route.js` lines 240–264, inside `computeAdminAnalytics()`, reached from `export async function GET` (line 305, admin-gated) | **Confirmed verbatim.** `orphanedCertRefs` → `purgeBatch.delete()` → `await purgeBatch.commit()` inside a read path. `listUsers(1000)` is a single page and `usersSnap` uses `.select('name','email',…)`, exactly as reported. |
| 2 — alumni cache IDOR | `app/api/alumni/documents/route.js` line 92 (`alumni:ref:${normalizedRef}:${isAdmin ? 'admin' : 'public'}`), owner fields at lines 116 / 149 / 157, cache TTL `60` with `{ tags, swr: true }` at line 172 | **Confirmed verbatim.** Owners and anonymous callers share the `:public` segment, and `pdf_base64` / unmasked `recipient_email` are computed *inside* the cached closure. `{ isRefCode } && !token` passes the auth gate at line 48, so the poisoning caller may be anonymous. |
| 3 — spoofable IP | `utils/server/requestUtils.js` lines 12–19 | **Confirmed verbatim.** `cf-connecting-ip` and `x-real-ip` are trusted ahead of the forwarded chain, with no `::ffff:` unwrap and no IPv6 grouping. 15 call sites confirmed. |
| 12 — `.env.example` infra URL | `.env.example` vs `git show HEAD:.env.example` | **Already fixed in the working tree.** The concrete URL is gone; the file now reads `UPSTASH_REDIS_REST_URL=https://your-database.upstash.io`. **Do not re-do this**; it only needs to be committed. |

**Additional context the audit could not see** (it inventoried the tree but did not weigh in-flight state):

- `firestore.rules` has **10 uncommitted deleted lines**. I checked this specifically because rule changes are security-relevant: the deleted helper is `validQuizAttempt(slug)`, which is **defined once and never referenced anywhere in HEAD**, and the live `match /quizAttempts/{slug}` block (lines 103–106) is unchanged and still `allow write: if false`. So this is dead-code removal, **not** a weakening. Keep it — but it belongs in its own commit.
- `package.json` is already bumped `2.10.57 → 2.10.58` for that uncommitted compliance work.

---

## 2. Blocker to clear before any security fix is committed

Current `git status`: modified `.env.example`, `app/privacy/page.jsx`, `app/terms/page.jsx`, `firestore.rules`, `package.json`; untracked `docs/REGULATORY_COMPLIANCE_REVIEW.md`, `docs/SECURITY_AUDIT_FINDINGS_2026-09-28.md`, `scratch/`.

Per `AGENTS.md`, every push with code changes increments the version by `0.0.1`. If the security fixes are committed on top of this state, one commit sweeps unrelated compliance work together with security work, and the version means nothing.

**Required order:**

1. Bring the tree to a decision point: either commit the pending compliance work (`privacy`/`terms`/`firestore.rules` cleanup/`.env.example`/version `2.10.58`) as its own commit, or stash it. Owner's call — it is their in-flight work.
2. Then land security fixes as separate, isolated commits, each bumping `0.0.1`.
3. Keep `scratch/` out of the tree (`AGENTS.md` "Repository cleanliness"). Do **not** commit `docs/SECURITY_AUDIT_FINDINGS_2026-09-28.md` (internal findings) or this brief without an explicit owner decision.

---

## 3. Question that must be answered first: has finding 1 already fired?

The audit correctly says the purge is irreversible, but stops short of the operational follow-up. The `GET` path has been live, admin-reachable and re-executes on every cache miss, so damage may already exist.

**The implementing agent must, before writing any code:**

1. Count certificates currently in `/certificates`.
2. Cross-check against expected credentials: `examAttempts` with `status === 'COMPLETED' && passed === true && minted === true`, plus `/workforce_docs` and workforce certificates.
3. Report any passing, minted attempt whose certificate document no longer exists. That set is unrecoverable data loss and must be reported to the owner as such — not silently re-minted, since re-minting changes IDs and would break already-shared LinkedIn/verification links.

This is a report-only step. No writes.

---

## 4. Tier 1 — exact instruction for the implementing agent

Scope is strictly the three fixes below. No refactors, no cleanups, no other findings. Do not touch protected surfaces; none of these are protected surfaces.

### Fix 1 — `app/api/admin/analytics/route.js` (Critical)

Remove the mutation from the read path entirely.

- Delete only the purge block (the `if (orphanedCertRefs.length > 0) { … purgeBatch … }` section, lines ~254–264) and the `orphanedCertRefs` collection used solely to feed it.
- **Keep** the filtering that excludes orphaned certificates from `certsList`, so the admin dashboard numbers do not change.
- Replace the purge with a reported diagnostic count — e.g. surface `orphanedCertificates` (or equivalent) in the response so the condition stays visible instead of silently disappearing alongside the deletion.
- Do **not** add a replacement `POST` purge endpoint in this change. That is a separate, owner-reviewed decision.
- **Verify what changed:** response body shape must not lose fields the dashboard already reads, except the removal of any implicit purge side effect. No frontend consumer of the purge exists — I searched: `orphan` appears in the repo only in this route, the audit report, and unrelated roadmap/quiz content. So no UI work is implied.

### Fix 2 — `app/api/alumni/documents/route.js` (High)

Stop caching an authorization-dependent payload.

- Cache **only the public projection**. The `recipient_email` / `pdf_base64` / owner-scoped fields must be merged into the response **after** the cache read, not computed inside the cached closure.
- Include `pdf_base64` in nothing that gets cached, and keep `pdf_base64` out of the cached value entirely.
- Make the cache key viewer-independent: key it `alumni:ref:${normalizedRef}:anon` (or equivalently, drop the owner/admin distinction from the key once the cached value is public-only). Do not key per-UID unless the payload stays authorization-dependent — simplest correct option is the public-only cache.
- Preserve current external behaviour for the caller: an owner/admin still receives the unmasked email and the PDF; an anonymous caller still receives masked email and `null` PDF.
- Leave the authenticated non-ref branch (the `isEmail` path) logic intact — it already requires a token.
- Check the `{ tags: ['admin:certs', 'admin:workforce_docs'], swr: true }` invalidation still behaves after the change.

### Fix 3 — `utils/server/requestUtils.js` (High)

Re-use the repo's **existing** hardened convention rather than inventing a new one. `getSignupClientAddress()` in `utils/server/emailSignupHttp.mjs` (lines 23–40) already implements the correct trust order, and its comment states the deployment rule: Vercel overwrites `x-vercel-forwarded-for`, so client-supplied `cf-connecting-ip` / `x-real-ip` must not be trusted.

- Mirror that logic: trusted header only (`x-vercel-forwarded-for` when `process.env.VERCEL === '1'`, otherwise `x-forwarded-for`), first hop, `::ffff:` IPv4 unwrap, IPv6 grouped to `/64`, and a shared fail-safe bucket when absent.
- The current `'127.0.0.1'` fallback collapses all unidentified callers into one bucket and must not be described as a limit; the shared `'unknown'` bucket is the correct fail-safe.
- ⚠️ **Highest-risk item in Tier 1.** Confirm the production deployment platform before landing this. The fix is correct for Vercel; if production is instead served through Cloudflare with a verified proxy path, the trusted-header set differs. Check `vercel.json` / `firebase.json` / hosting config and do not blind-swap. If the platform is ambiguous, stop and report rather than guessing.
- Confirm this does not break local dev (where no trusted header is present) — dev must keep working through the shared bucket.
- Optional but do not bundle: `getRateLimitKey(prefix, request, uid)` ignores its `prefix` argument and drops it from the returned key. Note it; fix it separately if the owner wants.

### Explicitly out of scope for this pass

- Findings 4 and 9 (bind human-proof token to uid + purpose; add daily doc ceiling). Correct, but this is an auth-design change touching four endpoints and should follow Tier 1.
- Findings 5, 6, 10 (key rotation, plaintext corpus storage, SBV1 duplication). **Owner decision + operational access required.** If the SBV1 dedupe (10) is ever done, it must land with a parity test, because `AGENTS.md` requires the pepper to match across three copies and a mismatch fails silently as `Content integrity check failed`.
- Finding 8 (fail closed on missing `HUMAN_PROOF_SECRET`). **Do not flip this without checking production first** — if the variable is unset in production, failing closed immediately breaks human verification and therefore quiz, docs and AI access. Confirm the variable is set, set it if not, then change the code. This is an env-var change and must be reported to the owner per the proactive-communication rule in `AGENTS.md`.
- Finding 15 (test suite claims). Fix by **adding** the missing coverage — SBV1 pepper parity, the cache-key/authorization interaction, and the `getClientAddress` trust order — and correcting the stale counts in `AGENTS.md`. Do **not** fix it by deleting unrun entries from `package.json`; that reduces claimed coverage without reducing risk. Note the `AGENTS.md` test-count line is a factual claim that is currently wrong.

---

## 5. Acceptance criteria for the Tier 1 change

- `npm run lint` clean.
- `npm test` runs with no new failures; report the actual suite/test counts observed, not the figures declared in `AGENTS.md` or in the audit.
- `npm run guard:templates` passes (no frozen template touched).
- Focused proof for each fix: (1) the analytics route contains no delete/commit call; (2) a cache entry produced by an owner request cannot serve unmasked email or a PDF to an anonymous caller; (3) a forged `cf-connecting-ip` / `x-real-ip` header no longer changes the rate-limit subject.
- Version bumped by `0.0.1` per `AGENTS.md`.
- A local preview URL reported (reuse the running dev server — `http://localhost:3000` was reachable during the audit — rather than starting a duplicate).
- The `AGENTS.md` mandatory rulebook pass completed in the final response, including splash / hero-floater / footer / theme checks (expected to be "unchanged", but they must be stated).

---

## 6. What I am not doing

I have not edited any application code, have not committed anything, and am not making the version bump myself — the working tree carries unrelated in-flight work, and committing the security fixes on top of it would conflate two changes in one version. Sequencing is the owner's decision.
