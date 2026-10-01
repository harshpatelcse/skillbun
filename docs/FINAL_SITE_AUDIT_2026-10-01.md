# SkillBun site-wide audit — 1 October 2026

Release: **2.10.64**. Scope: inspect the existing site, repair confirmed bugs, validate, and push. This release preserves the product design and existing journeys.

## Repairs

| Area | Confirmed issue and resulting behavior |
| --- | --- |
| Account and profile | Cached profiles are bound to their account; another account's cached details cannot migrate into the signed-in profile. External sign-out clears local state, and late saves cannot repopulate a different account's cache. |
| Auth and verification | CAPTCHA polling ends and cleans up correctly. A successful reset request remains successful when browser storage is blocked. The existing server auth wrapper continues to enforce token revocation checks. |
| Adaptive quiz and Bun-Bot | Rapid clicks cannot trigger duplicate selections/messages. Replies and quiz results arriving after clear, account changes, or unmount cannot update an obsolete conversation. Decorative typing respects reduced motion. |
| Preferences | Signed-in subscription state is fetched and represented honestly; stale preference requests cannot overwrite newer choices. Public unsubscribe email entry remains editable and validated. |
| Roadmap progress | Whole-progress saves are serialized, preventing a late response from undoing a newer click. Certification unlocks at the actual 60% threshold rather than rounding 59.5% upward. |
| Certification | Selecting an answer cannot reset its 45-second deadline. Duplicate next/submit actions are guarded. Submission retries use frozen answers. Human proof is bound to the student, and account changes invalidate obsolete client exam state. The server permits only one active attempt for the same student and roadmap. Two actual failed grades trigger the study cooldown; starting attempts alone does not. Daily quota remains enforced transactionally. |
| Guides and banks | Restored **240** missing encrypted guides from existing local source backups and rebuilt the encrypted manifest. All **3,095** existing guide ciphertexts are unchanged. All **3,335** guides authenticate, and all **3,323** distinct catalogue guide references resolve. Three difficulty labels in two banks were corrected; every one of the **100** banks now contains 50 questions with the required 14/26/10 distribution. Questions, answers, and options were preserved. |
| Certificates and alumni | Share links use the canonical site, missing issue dates are not fabricated, revoked certificates do not incorrectly prevent retakes, and alumni results remain bound to the current account/query. Frozen credential renderers were preserved. |
| Projects and menus | Project search has a label; filters expose selection state. Blueprint dialogs have names, focus trapping, Escape dismissal, and focus/scroll restoration. Account and language menus support keyboard navigation. Language text uses readable theme tokens. Functional icons in touched controls use existing SVG patterns. |
| Homepage and search | The quiz CTA still navigates with blocked browser storage. Reduced-motion users do not receive text scrambling. Unsupported salary/job-count and latency claims in illustrative previews were corrected. Contact search opens `/contact`; cache versions prevent old cached results from retaining the broken destination. Hero structure, floating code elements, splash, and footer remain preserved. |
| Workforce admin | Actions reject malformed/unknown fields and unsafe IDs. Credential passwords retain intentional whitespace. Failed credential encryption stops mail/status changes. Milestone assignment is checked in the write transaction. Document history includes legacy activation records, preserves equal-timestamp siblings, follows every page, and filters immediately. Revocation validates IDs and booleans strictly. |
| Password reset | Allowance is reserved before account lookup/mail dispatch, preventing concurrent requests from flooding the mailbox. Responses remain generic for unknown accounts. |
| Dependencies and titles | Updated DOMPurify and vulnerable transitive packages using compatible overrides; the audit reports zero vulnerabilities. Page title metadata no longer appends SkillBun twice. |

## Verification

- **494/494 tests passed** under Node 22, including account isolation, stale responses, authentication/human-proof barriers, certification transactions, mail allowance concurrency, workforce validation/pagination, guide coverage, and question-bank distribution. External services in these tests use controlled substitutes.
- Full lint, production build, document-template immutability guard, and whitespace/diff checks passed.
- Dependency audit: **0 vulnerabilities**, including the production dependency audit.
- Final local production build: **147/147 read-only HTTP checks passed**, covering all 100 roadmap pages, public/student/admin routes, route rewrites, API guest barriers, hidden quiz/guide paths, and homepage CSP/cache headers.
- Live site baseline: **47/47 read-only checks passed** before this release was pushed. This is a baseline, not confirmation that the new commit is deployed.
- Browser checks covered public pages, guest access/redirects, search keyboard selection, desktop/mobile menus, project search/filtering, all **14** blueprint dialogs, all **10** FAQ disclosures, cookie preference dismissal, roadmap learning/resources, and the JavaScript, static HTML/CSS, and Python playgrounds.
- Mobile layouts on the main public journeys were checked for horizontal overflow and missing images. Dark/light theme rendering and the patterned light background were inspected. Browser verification found the stale search-cache issue, which was repaired and retested on the rebuilt production bundle.

## Security categories

| Category | Result and scope |
| --- | --- |
| Authentication/session handling | Existing revocation verification preserved; account-state and CAPTCHA cleanup bugs repaired; guest gates and regression tests pass. Real Google/email sign-in was not completed. |
| Authorization gaps | Profile isolation and transactional milestone ownership repaired. Admin/student API guest barriers and ownership tests pass. |
| Secrets/keys/tokens | Tracked source and release file selection checked; environment files, private keys, raw guide backups, and local agent files are excluded. No credentials were printed or added. An exhaustive historical Git secret scan was not performed. |
| Injection | Strict IDs, schemas, URL guards, and existing rendering sanitization preserved; DOMPurify patched. Validation regressions pass. |
| API protection | Certification human-proof requirement repaired; protected API guest checks pass; server grading/minting remain authoritative. |
| Input validation | Workforce mutation, revocation, cursor, date, boolean, and unknown-field validation repaired and tested. |
| Rate limiting | Password-reset reservation race repaired; existing AI, auth, document, and human-verification limits preserved. |
| Object references | Student ownership, certificate identity, workforce assignment, and document ID validation covered by targeted tests. |
| Headers/CORS/cookies | Production nonce-based CSP and no-store homepage checks pass. Existing Firebase helper-route exclusions and theme/consent wiring preserved. No CORS or cookie configuration changes. |
| Dependencies | Compatible patch updates and overrides installed; current audit reports zero vulnerabilities. |
| Logs/errors | New handlers retain generic auth/reset responses and avoid returning exam answers or PDF bodies in document listings. Smoke checks print only paths/statuses. No production log-export inspection was performed. |

## Limits and deployment

This is a broad source, automated, and guest-browser audit. It does not establish that every authenticated action or third-party integration has been exercised live. No production account was created/deleted, mail sent, workforce status changed, certificate minted, or AI provider key used for test generation. Authenticated Firebase/SMTP/admin integration, live certification, and all external video availability remain unverified.

The production-mode localhost signup view rejects the existing Turnstile site key because the local origin is not its production domain. Use the existing development environment or a Turnstile test site key for local authenticated testing; production protections were preserved.

No new environment variable, credential, service, Firestore rule deployment, data migration, or composite index is required. Normal application redeployment is required to publish this release. Keep the existing `DOCS_ENCRYPTION_KEY` unchanged: the restored guides use the current vault key. The existing `WORKFORCE_ENCRYPTION_KEY` must be valid before saving workspace credentials; failures now stop safely. Document history reads the filtered registry into its existing 60-second admin cache before stable pagination; very large registries incur a full read on cache refresh.

Local preview: **http://127.0.0.1:3000**.

## Rulebook pass

- Scope: confirmed bugs, their regression coverage, dependency patches, restored source assets, and this audit record only. No redesign or unrelated cleanup.
- Identity: official SkillBun assets and wordmark preserved.
- Splash: branded first-load experience preserved.
- Hero/floaters: structure and identity preserved; only reduced-motion handling and inaccurate illustrative claims were corrected.
- Footer: identity, structure, badges, and links preserved.
- Themes: shared dark/light mechanism and patterned light background preserved; touched UI inspected in both themes.
- Sensitive areas: auth/cache, certification, mail limits, and workforce changes are intentional bug fixes. AI cascade, environment names, abuse protections, Firestore rules, and frozen credential templates preserved.
- Verification: passing checks and integration limits are stated above.
- Preview: one local server remains available at the URL above.
