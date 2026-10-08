# SkillBun operations

Use this guide for setup and maintenance. [Current status](CURRENT_STATUS.md) records what is implemented and what remains unverified. Runtime version and scripts come from [`package.json`](../package.json); do not copy old audit commands or deployment claims.

## Local setup

1. Use **Node.js 22.x**, matching CI and the declared engine. The native RAG package was verified on Node 22, not the machine's newer system runtime.
2. If no local environment file exists, copy [`.env.example`](../.env.example) to `.env.local` and replace placeholders using authorized development configuration. Preserve existing `.env`/`.env.local` files; do not overwrite them or commit credentials.
3. In PowerShell, install dependencies and start the app:

```powershell
$env:ONNXRUNTIME_NODE_INSTALL = 'skip'
npm ci
npm run dev
```

Reuse an already-running repository server. The normal URL is `http://localhost:3000`; use the actual URL/port printed by Next.js. Avoid simultaneous dev/build processes writing the same `.next` directory. After a local build check, restart one dev server for preview.

## Executable Firestore rules checks

Use Node.js 22, Java 21 or newer on `PATH`, and Firebase CLI 15.29.0 (`npm install --global firebase-tools@15.29.0`). After `npm ci`, run `npm run test:rules`. The separate GitHub CI job installs these prerequisites and executes the same suite.

The runner uses `firebase.emulator.json`, binds to loopback, forces the non-production project `demo-skillbun-rules`, and writes generated emulator logs under ignored `.codex-tmp/firestore-rules/`. The suite refuses to initialize without a loopback emulator and the exact demo project. It needs no production credentials and never deploys rules. Its synthetic owner, admin, intern, unverified and deletion-marked identities exercise profile metadata protection, progress validation, private certificates, server-only exam/OTP/erasure state and workforce permissions. These checks supplement the ordinary `npm test` suite.

## Configuration map

| Area | Configuration / requirement |
| --- | --- |
| Firebase client | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`; optional values are in the example. These are public client configuration, not Admin secrets. |
| Firebase server | `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, or the existing supported server aliases. Auth and Firestore must be reachable with the correct project permissions. |
| Origins | Production `APP_ORIGIN` and `NEXT_PUBLIC_APP_URL` are `https://skillbun.tech`; `APP_ALLOWED_ORIGINS` contains only owned app origins. Use the matching local origin for development request validation. Public variable changes require a rebuild. |
| OTP and human proof | Prefer dedicated server-only random `SIGNUP_OTP_SECRET` and `HUMAN_PROOF_SECRET` values of at least 32 characters. Signup permits the explicitly configured strong human-proof secret as its OTP fallback; it does not accept the AI-key/development fallback. See the signup guide. |
| CAPTCHA | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_ENABLED`. Both keys plus enablement are needed. Existing development-only bypass support is not valid in production. |
| Shared limits/cache | `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or existing supported KV aliases. Signup can use Firestore as a durable fallback; it fails closed when durable enforcement is unavailable. |
| Outgoing mail | Zoho host/port/user/password; outgoing mailbox is **noreply@skillbun.tech**. Replies, CC and human contact go to **harsh@skillbun.tech**. OTP and other mail cannot be verified without delivery configuration. |
| AI runtime | Optional `GROQ_API_KEY`, `TOKENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, `OPENROUTER_API_KEY`; `TOKENROUTER_MODEL` and `COUNSELLOR_AI_PROVIDER` tune existing behavior. `GEMINI_API_KEY` is deprecated; `GEMINI_*` timeout/retry/rate-limit settings remain active. |
| AI emails | Draft generation needs one of Groq, TokenRouter or OpenRouter. It uses its own validated provider sequence; it is not an automatic campaign scheduler. See the email guides. |
| Encrypted guides | `DOCS_ENCRYPTION_KEY` must match the existing SBV1 corpus. Never replace it with a newly generated key just to resolve a deployment error. |
| Workforce secrets | `WORKFORCE_ENCRYPTION_KEY` must match stored encrypted credentials. Follow existing rotation/migration requirements; changing the key alone makes old values unreadable. |
| Admin access | Existing `ADMIN_EMAILS` and/or Firestore admin registry plus a verified signed-in identity. Do not expose service-account credentials to the browser. |
| Optional integrations | Analytics client settings and `NEXT_PUBLIC_LINKEDIN_ORGANIZATION_ID` are listed in the example. Optional retrieval-model/index settings belong in [RAG architecture](rag-architecture.md). |

Do not use production AI keys for tests, bulk content generation or migration scripts. The regular unit suites use service doubles. Provider fallback improves availability; it does not establish answer quality or guaranteed zero cost.

## Release checks

```text
npm run guard:templates
npm run lint
npm test
npm run build
npm audit
git diff --check
```

CI uses Node 22 and `ONNXRUNTIME_NODE_INSTALL=skip`. It also verifies that `@huggingface/transformers` imports. A passing import does not mean the vector artifact is fresh or external models work.

For HTTP/security smoke checks, use a **production build server**, because the script deliberately rejects development's `unsafe-eval` policy. In a terminal, after a successful build:

```text
npm run start -- --hostname 127.0.0.1 --port 3001
```

In another terminal:

```text
npm run audit:smoke -- http://127.0.0.1:3001
```

Stop that temporary server after checking. The script makes read-only public/unauthenticated requests; it does not verify signed-in flows, send mail, or prove Firestore's deployed rules match the repository.

## Deployment checklist (Hinglish)

1. **Vercel mein Node 22 aur existing environment values verify karo.** Production secrets ko logs/chat mein paste mat karo. `.env.example` ki placeholders actual secrets nahi hain. Is release ke liye koi naya runtime variable required nahi hai. Python Playground ko public jsDelivr se pinned Pyodide 0.26.4 assets download karne ki network access chahiye; app-wide CSP ko relax mat karo.
2. **Firebase project check karo.** Repository default `skillbun-75d10` hai; deploy karne se pehle intended project confirm karo. Standard Firebase Auth selected hai. Identity Platform/blocking function optional hai; routine web release mein use deploy karna required nahi hai.
3. **Google login configuration check karo.** Canonical domain `skillbun.tech`, Firebase Authorized Domains, OAuth redirect `https://skillbun.tech/__/auth/handler`, aur `/__/auth/*` proxy sahi hone chahiye. Firebase helper routes par app CSP/frame headers mat lagao.
4. **Firestore separately deploy/verify karo.** Vercel build rules/indexes deploy nahi karta. Is release ke rules `firebase deploy --only firestore:rules --project skillbun-75d10` se 30 September 2026 ko publish hue; live raw certificate read 403 aur public missing-ID lookup 404 verified hain. Future reviewed index changes ko separately deploy karo; unscoped `firebase deploy` optional functions ko bhi include karta hai.
5. **Mail aur CAPTCHA apne approved test account se check karo.** OTP send/resend/expiry, password reset, Google login aur production Turnstile verify karo. Sirf draft preview se email delivery prove nahi hoti.
6. **Student journey check karo.** Onboarding → quiz → recommendation → roadmap guide/progress → eligible exam → submit → certificate. Refresh/second device se progress sync check karo. Quiz results/chat currently device-independent history mein save nahi hote.
7. **Admin/intern role checks karo.** Student/admin separation, workforce credential ownership, email suppression and document/PDF/QR access verify karo. Account deletion ke liye updated rules zaroor deploy karo; approved disposable account se deletion, retry aur certificate-link removal check karo. Real student data ko testing ke liye delete mat karo.
8. **Result update karo.** Actual deploy revision, date aur checked journeys isi maintained documentation mein record karo. Build pass ko production-ready stamp mat banao.

## Content and template maintenance

| Content | Maintenance contract |
| --- | --- |
| Roadmap metadata | `public/data/roadmaps/` contains the public catalog. Preserve both supported tree and legacy normalization paths; run roadmap/resource tests after changes. |
| Study guides | `content/docs/` is the encrypted runtime corpus and index. `public/data/docs/` is an ignored plaintext source backup, not disposable engineering documentation. Preserve both and the matching key. |
| Certification questions | `public/data/quizzes/` supplies authoritative static banks. Each bank has 50 questions in the required 14/26/10 difficulty split. Direct public HTTP downloads must remain blocked. |
| Career quiz pool | `content/quiz/` contains the encrypted runtime pool. Preserve matching encryption/decryption behavior and access checks. |
| RAG | Public roadmap data and allowlisted platform facts only. After catalog changes, prepare/evaluate the index following the RAG guide; never index student records, guide vaults or exam banks. |
| Certificates and legal PDFs | Released templates/assets are immutable. Use the versioned scaffold/registry workflow in the [certificate guide](CERTIFICATE_DESIGN_AND_PRINT_SPEC.md); never rewrite historical snapshots. |
| Email previews | `node scripts/preview-emails.mjs --export-only` generates synthetic local previews without sending. See [Email design system](EMAIL_DESIGN_SYSTEM.md) for inbox checks. Generated previews remain outside Git. |

Before re-encrypting guide content, preserve the existing corpus and matching key in controlled backups. Inspect `scripts/encrypt-docs.js` inputs/output and verify source coverage, encrypted counts and sample authenticated reads. Do not rotate keys, remove original guides or run bulk regeneration as a documentation cleanup step.

## Data retention, deletion and recovery

The repository does not establish a complete operational retention or restore policy. Agree and record collection/log retention, incident response, backup access, restore tests and erasure evidence before making guarantees to users. The responsible owner should also review vendor processing/transfer terms, published contact details, minor-consent requirements and credential/outcome wording; the removed audits' legal conclusions are not current legal verification.

- **Student deletion policy:** self-service and admin deletion remove the student profile and discoverable nested progress/quiz records, UID-owned exam attempts and roadmap certificates, eligible email-only legacy roadmap certificates, linked signup challenges, dispatch locks and Firebase Auth. Workforce profiles, workforce credentials, legal records, unsubscribe preferences and abuse-limit counters remain. Email-only legacy certificates are erased only when a verified Auth identity and issue date establish ownership within that account's lifetime; ambiguous records require manual review. The bounded traversal covers the current leaf-document schema but cannot guarantee removal of unknown historical subcollections beneath already-missing parent documents.
- **Deletion operation:** `/api/account` and `/api/admin/users/[uid]` use the same server-only `accountDeletions/{uid}` job. Self-service requires a login within five minutes. The server checks any supplied admin email against the selected Auth identity; email never selects another account. A lease and paginated checkpoints let a retry finish interrupted work. Auth is deleted last, and only an explicit complete response is shown as success. A signed, unexpired token can recover a lost final response only after the server independently confirms that Auth is absent and the job reached its final phase. Revoked, disabled or recreated identities do not use this exception.
- **Deletion deployment/recovery:** deploy the app and Firestore rules as a coordinated release. The marker denies ordinary APIs/client writes and is checked inside exam/email producer transactions, preventing erased data from being recreated. After completion it retains only UID-keyed status/timestamps, not the email. Do not remove these markers or apply TTL to them without a reviewed migration: old tokens and in-flight writers must remain blocked. No new environment variable or service is required; existing Firebase Admin and durable rate-limit access must work. Admins can retry a pending UID after the user session expires. Backups, external mail-provider logs and historical ambiguous records require separate retention/reconciliation; this flow does not purge them.
- Public verification uses `/api/certificates/verify?id=...`, returning only public rendering fields and revocation state. Stored UID/email/employee/attempt/admin metadata remains available to authorized internal consumers. Deploy the new application first, then the updated Firestore rules in the same release window; rules restrict raw reads to the owner/admin. Verify signed-out search/detail, owner dashboards and admin access after rollout. No data migration or new secret is required.
- Admin Certificate Studio issuance is separate from the student exam flow. Creation is transactional and rejects occupied document IDs or public aliases. PATCH accepts only boolean `is_revoked`; identity, score, title and template cannot be edited. Correct an error by revoking the original and issuing a new ID. Never reuse deleted credential IDs. No live issuance/correction was performed.
- Reconcile suspected historical certificate loss using `npm run certificates:reconcile -- --read-only --project <configured-project>`, with authorized Firebase Admin environment values loaded securely. The script only reads projected metadata, pages by document ID, excludes answer keys/encrypted credentials, and reports counts/reference IDs without personal values. Exit 2 means findings need review; exit 1 means the check did not complete. Paginated reads are not an atomic historical snapshot. Preserve issued IDs and snapshots; do not silently re-mint or purge records.
- Keep encryption keys recoverable separately from protected data backups. No backup export, key rotation, plaintext-source archival or restore was carried out in the documentation cleanup.
- OTP expiry is enforced in code. Optional Firestore TTL cleanup for `emailSignupChallenges.deleteAfter` is a separate cloud policy; see [Verified email signup](EMAIL_SIGNUP_SECURITY.md).
- Redis invalidation retries live in worker memory. Worker loss during an outage can leave other workers serving cached data until expiry. Do not describe this as durable cross-worker invalidation recovery.
- Workforce cascades above 500 writes are rejected before deletion. They require a separately designed resumable maintenance operation.
- An email dispatch in an uncertain state must be reconciled before retrying. Reviewed drafts do not send themselves; use the explicit admin flow described in [Email recommendations](EMAIL_RECOMMENDATION_ENGINE.md).

Keep machine-local rules, skills, recovery patches, credentials and source backups separate from deployable artifacts. Completed audits and plans belong in Git history, not a growing set of competing current guides.
