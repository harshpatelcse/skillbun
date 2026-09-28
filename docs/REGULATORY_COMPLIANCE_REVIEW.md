# SkillBun Regulatory & Documentation Alignment Review

> ## ⚠️ COUNSEL REVIEW REQUIRED — DO NOT RELY ON THIS REGISTER AS AUTHORITATIVE
>
> Per review verdict (29 Sep 2026), **qualified legal counsel must confirm the register before it is treated as authoritative.** Fourteen items are explicitly flagged **[UNVERIFIED]** in §9. Two are blocking:
>
> 1. **DPDP Rules 2025 Fourth Schedule exemption scope** — determines whether *any* children's-data relief exists for an educational platform. Two candidate URLs 404'd and the Gazette PDF fetch failed. **This item alone changes the under-18 strategy.**
> 2. **IT Amendment Rules 2026** — the synthetic-content labelling duty and 3-hour takedown window are **search-snippet level only**; the notification was never fetched. Bun-Bot generates synthetic content, so this may impose live duties.
>
> Also unverified and material: CERT-In 180-day log retention (only the 6-hour rule is confirmed), SPDI rule-by-rule text, E-Commerce Rules text, Copyright Act reasoning, UGC/AICTE positioning, the EU AI Act omnibus operative dates, ICO fee applicability, UK adequacy for India, the EAA date/scope, and US state AI laws.
>
> **Treat §4–§5 as a research briefing that sharpens the questions for counsel — not as settled legal conclusions.**

**Review date:** 28 September 2026
**Revision:** 29 September 2026 — added the certificate-field remediation appendix (§10) and the counsel-review gate above.
**Scope:** All repository documentation, the public legal pages (`/privacy`, `/terms`), and the platform's actual data-handling behaviour — mapped against Indian and global regulations applicable to an India-operated, globally reachable, AI-assisted student career platform.
**Status of this document:** Internal working analysis, not legal advice. Items marked **[UNVERIFIED]** must be confirmed against primary sources by qualified counsel before you rely on them.

---

## 1. Executive Summary

### 1.1 The single most important finding

**DPDP treats anyone under 18 as a "child" — not under 13.** SkillBun's entire audience includes students who are legally children under Indian law, and the platform has:

- No age gate or date-of-birth collection anywhere in the product.
- A privacy policy that addresses only "children under 13" (the US COPPA threshold, not the Indian one).
- An automated retention-email engine that sends marketing-style messages (welcome, reengagement, exam nudge, exam failed, cert congrats) that is not age-segmented.

Under-18 handling is the largest compliance exposure, and it is a **product design** issue, not a text issue.

### 1.2 What is already good

Several things are genuinely well-built and reduce risk substantially:

| Area | Why it scores well |
|---|---|
| **Analytics consent** | Four analytics systems (GA4, PostHog, Vercel Analytics, Speed Insights) are all gated behind an explicit opt-in; decline unloads them; withdrawal is possible from `/privacy`. This is better than most implementations. |
| **Email opt-out** | Marketing/retention emails carry a working unsubscribe link, and dispatch is server-side suppressed via `users/{uid}.isUnsubscribed` and an `unsubscribes/{email}` collection. Transactional templates deliberately omit the marketing footer. |
| **Firestore rules** | Strict, schema-validated, least-privilege. Certificates and exam attempts are client-unwritable and server-authoritative. This is strong. |
| **Encryption** | SBV1 (HKDF + AES-256-GCM + integrity hash) is a real, standards-based scheme. |
| **Trust-safe homepage** | The prior "no fake stats/testimonials" discipline is exactly what consumer-law risk management looks like. Preserve it. |

### 1.3 Headline gap count

| Tier | Count | Notes |
|---|---|---|
| MUST (live obligation now) | 8 | CERT-In, SPDI grievance officer, disclosures, minors |
| SHOULD (before 13 May 2027 / 1 Jan 2027) | 9 | DPDP build-out, AI Act, Colorado ADMT |
| NICE-TO-HAVE | 5 | Consent Manager readiness, DPIA pack, refund policy |

---

## 2. Method & Evidence Basis

Three parallel investigations were run:

1. **Repository inventory** — file-level read of analytics, consent plumbing, browser storage, proctoring, email, AI gateway, certificates, deletion paths, retention, infrastructure, and age gating. Every claim carries a `path:line`.
2. **Indian regulation register** — DPDP Act 2023 (verbatim Gazette text via MeitY), DPDP Rules 2025 (G.S.R. 846(E)), commencement notification G.S.R. 843(E), CERT-In Directions 2022, SPDI Rules 2011, IT Rules 2021, Consumer Protection Act 2019, Copyright Act 1957.
3. **Global regulation register** — GDPR (primary text), UK GDPR/DPA 2018, EU AI Act as amended by Reg (EU) 2026/1744, CCPA/CPRA, Colorado SB 26-189, COPPA (primary rule text), CAN-SPAM (FTC guide), ePrivacy Directive, EAA, ADA Title III, CLOUD Act, FERPA.

---

## 3. What SkillBun Actually Does (Verified Inventory)

This section is the factual baseline. **Every item here was verified in code.** Where the current documentation disagrees with this list, the documentation is wrong.

### 3.1 Data collected and stored

| Data | Where | Evidence |
|---|---|---|
| Name, email, display name, photo URL | Firestore `/users/{uid}` | `firestore.rules` |
| Degree, year of study, interest, target role | Firestore `/users/{uid}` + **plaintext in localStorage** (`sb_name`, `sb_email`, `sb_degree`, `sb_year`, `sb_interest`) | `utils/shared/profileStore.js:42–45` |
| Quiz answers, scores, attempt history | `/users/{uid}/quizAttempts/{slug}` (pruned to 24h) | `app/api/certify/start/route.js` transaction |
| Roadmap progress node IDs | `/users/{uid}/roadmapProgress/{slug}` + `skillbun_progress_<slug>` localStorage | `utils/shared/progressStore.js:3,37,50` |
| Exam attempt records incl. `userEmail` | `/examAttempts/{attemptId}` — **never deleted by any code path** | `app/api/certify/start/route.js:146–163` |
| Certificate records incl. `email` and `uid` | `/certificates/{certId}` — **publicly readable in full** | `utils/server/certificationState.mjs` mint; `firestore.rules` |
| Email dispatch history (unbounded array) | `users/{uid}.sentEmailHistory` | `utils/server/emailDispatchLock.js:113–128` |
| Unsubscribe state | `/unsubscribes/{email}` — **survives account deletion** | `app/api/unsubscribe/route.js` |
| IP address | Transiently for rate limiting; **sent to `api.ipify.org`** during exams; rendered in exam watermark | `app/roadmap/[slug]/certify/page.jsx:357–361` |

### 3.2 Browser storage inventory (15 keys)

`sb_consent_choice`, `sb_theme`, `sb_locale` (+ cookie, 1yr), `sb_bypass_captcha`, `sb_password_reset_available_at`, `sb_human_proof`, `sb_counsel_rl`, `sb_dest`, `sb_last_xp`, `sb_name`, `sb_email`, `sb_degree`, `sb_year`, `sb_interest`, `skillbun_progress_<slug>`, `sb_email_unsubscribed`.

**No sessionStorage usage found. One cookie only (`sb_locale`).**

### 3.3 Third parties receiving personal data

| Recipient | What they receive | Evidence |
|---|---|---|
| Google Firebase | Auth identity, all Firestore data | `utils/client/firebaseClient*` |
| Groq, TokenRouter, Hugging Face, OpenRouter, Pollinations, optional Ollama | **User free-text chat content** and quiz context (18,000 char cap per part) | `app/api/counsellor/route.js:107–141,151,185,215,270` |
| Google Analytics 4 (`G-XTFMS5Q59C`) | **Firebase UID** as `user_id` + product events incl. `degree`, `year` | `lib/analytics.js:80–96`; `AnalyticsProvider.jsx:44–63` |
| PostHog | `posthog.identify(uid)` + product events | `lib/analytics.js:80–96` |
| Vercel Analytics / Speed Insights | Page views, web vitals | `app/components/AnalyticsProvider.jsx` |
| Cloudflare Turnstile | Browser/network signals for human verification | `utils/client/quiz/quizCaptcha.js` |
| Zoho SMTP | Recipient email, message content | `utils/server/zohoMailer.js` |
| **api.ipify.org** | Student's public IP address (exams only) | `certify/page.jsx:357–361` |
| Upstash / Vercel KV | Rate-limit keys (may include IP) | `utils/server/rateLimitStore.js` |

### 3.4 Consent mechanism (verified working)

- Key: `sb_consent_choice` ∈ {`accepted`, `declined`} — `utils/client/analyticsConsent.js:5`.
- Open event `sb_open_consent` dispatched by `PrivacyPreferences.jsx:4`, listened for by `ConsentBanner.jsx:48` — **names match, no bug.**
- Update event `sb_consent_updated` — listened for in `AnalyticsProvider.jsx:29,82` and `instrumentation-client.js:3` — **names match.**
- Decline path: PostHog `opt_out_capturing()` + `reset()`, GA Consent Mode v2 all-denied, analytics components unmount.
- **Known minor bugs:** consent is binary (no per-vendor granularity); GA Consent Mode update is skipped if `window.gtag` isn't ready (`ConsentBanner.jsx:18`). Both are cosmetic given the hard unmount.

---

## 4. Indian Regulatory Register

### 4.1 DPDP Act 2023 + DPDP Rules 2025

**Commencement (verified from G.S.R. 843(E) and Rule 1):**

| Date | What commences |
|---|---|
| **13 Nov 2025** (in force) | Act ss. 1(2), 2, 18–26, 35, 38–43; Rules 1, 2, 17–21 — i.e. the Board's establishment |
| **13 Nov 2026** | Rule 4 (Consent Manager registration) |
| **13 May 2027** | **The main obligation set** — ss. 3–17 (notice, consent, children, breach, rights) and Rules 3, 5–16, 22, 23 |

> **Critical nuance:** no monetary penalty can be imposed today — s. 33 (penalty power) has not commenced and the Board has no appointed Chairperson/Members on record. *[Medium confidence — reference-site assertion, not a MeitY document.]* This is a grace period, not a free pass: the build-out must start now because 13 May 2027 is fixed.

**Requirement-by-requirement status:**

| Requirement | Status | Action |
|---|---|---|
| Itemised notice before consent (s. 5), available in English or an Eighth Schedule language | ⚠️ Partial | Rebuild onboarding consent screen |
| Valid, specific, informed consent (s. 6(1)) | ⚠️ Partial | Add purpose-specific granularity |
| Contact of DPO/authorised person in the consent request (s. 6(3)) | ❌ Gap | Now named in Privacy Policy §1 — build into consent UI too |
| Withdrawal with comparable ease (s. 6(4)) | ✅ Analytics yes / ⚠️ Partial overall | Add a general withdrawal path |
| Burden of proof — must prove notice + consent (s. 6(10)) | ❌ Gap | Retain timestamped consent records |
| Processor contracts (s. 8(2)) | ❌ Gap | DPAs with all AI providers + Zoho |
| Accuracy where data drives decisions (s. 8(3)) | ⚠️ | Quiz scores drive recommendations |
| Reasonable security safeguards (s. 8(5), Rule 6) | ⚠️ Partial | Rule 6 requires ≥1-year log retention |
| Breach notification — users without delay, Board in 72h (s. 8(6), Rule 7) | ❌ Gap | Write the runbook |
| Erasure on withdrawal (s. 8(7)–(8), Rule 8) | ❌ Gap | No deletion workflow for examAttempts/certificates |
| Publish DPO contact (s. 8(9), Rule 9) | ⚠️ Partial | Now published in Privacy Policy §1 |
| Grievance redressal (s. 8(10), Rule 14 — 90-day limit) | ⚠️ Partial | Now published in Privacy Policy §1 and Terms §10 |
| Data Principal rights: access, correction, erasure, **nomination** (ss. 11–14) | ❌ Gap | No nomination mechanism exists |
| **Children's data (s. 9)** | ❌ **Critical gap** | See below |
| Cross-border transfer (s. 16, Rule 15) | ✅ Permitted | Negative-list model; US/EU AI providers allowed |
| SDF duties (s. 10, Rule 13) | ✅ N/A | No government notification |

**Penalty exposure:** up to **₹250 crore** (security safeguards), **₹200 crore** (breach notification or children's data), **₹150 crore** (SDF duties), **₹50 crore** (other).

### 4.2 Children's data — the decisive issue

**Verified verbatim:**
- s. 2(f): *"'child' means an individual who has not completed the age of eighteen years."*
- s. 9(1): verifiable parental consent required before processing a child's data.
- s. 9(2): no processing likely to cause detrimental effect on a child's well-being.
- s. 9(3): **no tracking, behavioural monitoring, or targeted advertising directed at children.**

**The Fourth Schedule exemption** (Rule 12) reportedly covers educational institutions but is **conditioned on health and safety purposes**. **Do not plan on relying on it.** *[UNVERIFIED — the Fourth Schedule verbatim text could not be fetched; two candidate URLs returned 404 and the Gazette PDF fetch failed. This is the single most consequential unverified item in this review.]*

**Consequences:**
1. From 13 May 2027, every under-18 user needs **verifiable parental consent**.
2. The retention email engine sends **marketing-style messages** — sending targeted promotional communication to under-18s sits close to the s. 9(3) prohibition. This is a genuine design conflict needing a documented decision.
3. Age-segmentation must exist before the engine can safely operate at scale.

### 4.3 IT Act 2000 + SPDI Rules 2011 — *the regime binding you today*

**Status: still fully in force.** DPDP s. 44(2) (which would omit IT Act s. 43A, the hook for the SPDI Rules) sits in the **18-month group commencing 13 May 2027**. Until then, the SPDI Rules apply alongside DPDP.

**Key point:** the SPDI "sensitive personal data" categories (passwords, financial info, health, sexual orientation, medical records, biometrics) **do not obviously include** name, email, degree, year, interests, quiz answers, or scores. So the strict consent-before-collection duty likely isn't triggered by your core dataset.

**But the broad duties do apply, and are largely unmet:**
- Publish a privacy policy — ✅ now done properly.
- Appoint and publish a **Grievance Officer** with name, email, phone, and postal address — ⚠️ name + email now published; **phone and postal address still missing**.
- Reasonable security practices (ISO 27001-equivalent) — ⚠️ strong technical controls, no formal ISMS.

> *[Rule-level SPDI text was not fetched in this review — the rule-number mapping is from training knowledge. Verify before relying.]*

### 4.4 CERT-In Directions, 28 April 2022 — **live and urgent**

| Requirement | Status |
|---|---|
| **6-hour reporting** of specified cyber incidents (Annexure I includes data breach/leak) to CERT-In | ❌ No runbook, no named PoC found |
| **180-day log retention** within Indian jurisdiction | ❌ No evidence of configured retention *[figures unverified in this run — verify against the direction PDF]* |
| Point of Contact for CERT-In coordination | ❌ Not established |
| NTP synchronisation with NIC/NPL | ❌ Not verified |

**Verified:** the 6-hour duty is already in effect and applies to "service providers, intermediaries, data centres, body corporates."

**Critical interaction:** **6 hours to CERT-In (now)** vs **72 hours to the Data Protection Board (2027)**. You need **one** incident-response runbook with the faster clock as the trigger — not two separate processes.

### 4.5 IT (Intermediary Guidelines) Rules 2021 — *medium confidence*

- **February 2026 amendment (effective 20 Feb 2026)** reportedly addresses synthetically generated information (SGI) and deepfakes, with **AI content labelling** and a **three-hour takedown window**. *[Search-snippet level only — the notification was not fetched. **This is the highest-value item to verify next**, because Bun-Bot generates synthetic content.]*
- Baseline Rule 3(1) duties (verify): publish user agreement + privacy policy, appoint an **India-resident Grievance Officer**, acknowledge complaints in 24h, resolve in 15 days, publish monthly compliance reports, act on takedown orders in 36h.
- **Safe-harbour caveat:** SkillBun's own AI output and its own licensed study guides are better characterised as **SkillBun's own content**, not third-party content — so s. 79 safe harbour is weak for those surfaces.

### 4.6 Consumer Protection Act 2019 — **live exposure today**

E-Commerce Rules 2020 likely **do not apply** while no payment is collected. They engage on the first rupee.

**The CPA 2019 itself does apply**, and its unfair-trade-practice provisions capture false or misleading representations about the **usefulness of a service**:

- **Salary ranges** in roadmaps (`$80,000–$145,000/yr`) are outcome claims. Present them as **indicative market benchmarks with a source and date**, not expected earnings. *This wording is now in Terms §8.*
- The `Sample student moments` homepage section being clearly illustrative is exactly right — **that framing must be preserved.**
- The **CCPA Guidelines for Prevention of Misleading Advertisements, 2022** cover education-sector claims and ban unsubstantiated outcome/"guaranteed" claims. *[Not verified in this run.]*

### 4.7 Education-specific

- **UGC** regulates degree-granting; **AICTE** regulates technical education. SkillBun issuing its **own** certificates in a career-guidance context does **not** require UGC/AICTE approval.
- The real risk is **misrepresentation** — implying a SkillBun certificate is a government-recognised degree. *The "not a degree" disclaimer is now in Privacy Policy §8 and Terms §6.*
- *[UGC/AICTE sources were not fetched — treat this subsection as unverified.]*

### 4.8 Copyright Act 1957 — *low confidence, flagged*

- CC licences are generally enforceable in India (s. 30 grants; Berne member). Registration is voluntary.
- **A tension worth resolving in writing:** CC BY-NC-ND permits non-commercial verbatim redistribution with attribution, while SBV1 encryption + auth gating enforces a controlled distribution channel. This is resolvable, but deserves one coherent written licensing statement.
- *[Not verified against sources in this run.]*

### 4.9 Refund/cancellation policy

**Not required today** (no payment collected). **Becomes required on the first payment** — publish ahead of time so the transition isn't a scramble.

### 4.10 Email marketing in India

**There is no Indian equivalent of CAN-SPAM for email.** The compliance basis for retention emails in India is the **DPDP consent + notice framework**, plus the s. 9(3) children's question. TRAI's TCCCPR 2018 addresses telecom/SMS/voice, not email. *[Not verified.]*

---

## 5. Global Regulatory Register

### 5.1 GDPR — **applies now**

**Why:** Art. 3(2)(a) — *"the offering of goods or services, irrespective of whether a payment of the data subject is required, to such data subjects in the Union."* The no-payment carve-out is explicitly irrelevant. A free, globally reachable, English-language service accepting EU sign-ups is caught. **No EU establishment needed.**

| Requirement | SkillBun status |
|---|---|
| Lawful basis per purpose (Art. 6) | ⚠️ Partial — now documented in Privacy Policy §4 |
| Art. 13/14 notice incl. recipients, transfers, retention, rights, AI logic | ⚠️ Substantially improved, now documented |
| Data subject rights, 1-month response deadline (Arts. 15–22, 12(3)) | ❌ No formal workflow |
| **Child consent, age 13–16 by Member State (Art. 8)** | ❌ **Gap** |
| **EU representative in writing (Art. 27)** | ❌ **Gap** |
| **DPIA (Art. 35)** — AI + proctoring + minors triggers ≥2 EDPB criteria | ❌ **Gap** |
| Art. 22 automated decisions | ⚠️ Quiz scoring → certificate issuance needs a look |
| **Transfers — India has NO EU adequacy decision** | ❌ **Gap** — needs SCCs + TIA for every US recipient (Groq, TokenRouter, OpenRouter, Hugging Face, Pollinations, Google/Firestore, Vercel, Cloudflare, Upstash) |

**Verified:** the Commission's current adequacy list (Andorra, Argentina, Brazil, Canada-commercial, Faroe Islands, Guernsey, Israel, Isle of Man, Japan, Jersey, New Zealand, Republic of Korea, Switzerland, UK-renewed, US-DPF, Uruguay, EPO) **does not include India.**

**Verdict: PARTIAL → NON-COMPLIANT on the EU side.**

### 5.2 UK GDPR + DPA 2018 — **applies if UK users are served**

- Same territorial logic; same gap set.
- UK child consent age is **13** (DPA 2018 s.9).
- Mechanism would be **UK IDTA / UK Addendum** + TIA. *[UK adequacy for India UNVERIFIED.]*
- **ICO registration fee:** the duty exists for organisations using personal information *"unless they are exempt."* **Whether it extends to a non-UK-established controller caught by Art. 3(2)-equivalent scope is UNVERIFIED** — three ICO subpage fetches failed.

### 5.3 EU AI Act — **Art. 50 is LIVE NOW**

**Timeline (verified):**
- **Art. 50 transparency: applies since 2 August 2026 — already enforceable.**
- Pre-existing synthetic-content systems: Art. 50(2) compliance by **2 Dec 2026**.
- **Annex III high-risk duties: likely deferred to 2 Dec 2027** by Reg (EU) 2026/1744 (Digital Omnibus). *[Conflict flagged: secondary sources say 2 Dec 2027; the FLI timeline still shows 2027; the omnibus's operative articles were not read — only recitals.]*

**Art. 50 requires** (1) AI systems interacting directly with people must **inform them they are interacting with an AI**; (2) synthetic content must be marked machine-readable/detectable.

> **SkillBun: Bun-Bot must disclose it is an AI at first interaction. This is non-compliant today and live now.** *The AI disclosure is now added to Terms §2 — but it also needs an **in-product** disclosure at the chat interface.*

**High-risk classification:** Annex III point 3(d) covers *"monitor and detect prohibited behaviour of students during tests … in the context of or within educational and vocational training institutions."* Your proctoring feature sits closest to this, but the clause is framed by institution context, which a private platform is not — **genuinely ambiguous**. Art. 6 requires a **documented classification decision**, so produce and retain an Art. 6(3) memo.

### 5.4 US — COPPA

15 U.S.C. §§ 6501–6506; 16 CFR Part 312. Amended Rule effective 23 June 2025, **full compliance 22 April 2026**.
- Covers services **directed to children under 13**, or with **actual knowledge** of under-13 users.
- "Personal information" **expressly includes persistent identifiers including IP addresses.** Your proctoring watermark collects exactly that.
- **Status: PARTIAL/conditional.** Add a neutral age screen at signup.

### 5.5 US — State privacy laws

| Law | Status |
|---|---|
| **CCPA/CPRA (California)** | **Likely not applicable yet** — thresholds are >$25M revenue, OR 100k+ CA consumers, OR ≥50% revenue from selling PI. No payments, no ads, no "sale"/"share." **Growth-triggered — track annually.** |
| **Colorado SB 26-189 (2026) — ADMT** | **Enacted, in force 1 Jan 2027.** Defines "consequential decision" to **expressly include education**. Duties: developer documentation, point-of-interaction notice, plain-language adverse-decision explanation within 30 days, access/correction rights, and **meaningful human review**. AI quiz → roadmap/credential decisions plausibly qualifies. |
| **Virginia / Connecticut / others** | *[UNVERIFIED — inference only.]* |
| **FERPA** | **Does not apply.** Binds institutions receiving federal funds; direct-to-student platforms hold no institution-maintained records. Re-assess only if you sell to institutions. |
| **FTC Act § 5** | Exposure for unsubstantiated education/career-outcome and AI capability claims. **Build a substantiation file.** |

### 5.6 CAN-SPAM — **applies to US recipients, live now**

Verified from the FTC guide: no B2B exception; penalties up to **$53,088 per email**.

| Required element | SkillBun status |
|---|---|
| Truthful headers / From | ✅ |
| Non-deceptive subject lines | ✅ |
| Clear identification as an advertisement | ⚠️ |
| **Valid physical postal address** | ❌ **ABSENT** — `emailTheme.js:806–824` has no postal address |
| **Clear opt-out explanation + working mechanism** | ✅ Present |
| **Honour opt-outs within 10 business days** | ✅ Server-side suppression exists |
| Separate marketing from transactional content | ⚠️ Lifecycle emails mix both |

> **The 72-hour gap in `emailDispatchLock.js` is a frequency control, NOT the legal test.** Do not confuse the two.

### 5.7 EU ePrivacy Directive — cookies/storage

Art. 5(3): consent required for device storage **unless strictly necessary**.

| Item | Analysis |
|---|---|
| `sb_theme` | User-initiated functional preference → commonly exempt |
| Firebase auth tokens | Strictly necessary to provide the requested login → exempt |
| Cloudflare Turnstile | Security/anti-abuse → commonly strictly necessary. *[Cloudflare's own classification UNVERIFIED.]* |
| **Analytics** | **Consent-gated** ✅ — you already do this correctly |

**Action:** publish a short cookie/storage notice listing each item and its exemption basis. No full banner is required beyond the existing consent, but the notice should exist.

**ePrivacy Art. 13** also restricts direct marketing by electronic mail to consent (soft opt-in for existing customers).

### 5.8 Accessibility

- **WCAG 2.2 AA** — adopt as the operating standard. Not law itself, but the benchmark.
- **European Accessibility Act (Directive (EU) 2019/882)** — covers an enumerated list: computers/OS, smartphones, telephony, audiovisual media, transport, banking, e-books, e-commerce. **A free career-guidance service is not on the list. Likely outside scope — but genuinely ambiguous.** *[Application date UNVERIFIED — the target page 404'd.]*
- **ADA Title III (US)** — DOJ position: applies to web offerings of public accommodations; **no detailed regulatory standard**; WCAG is the de facto benchmark. The April 2024 web rule covers **state/local governments only**.

> **Action: run a WCAG 2.2 AA audit and publish an accessibility statement.** This is the cheapest single way to neutralize both the EAA ambiguity and ADA Title III risk.

### 5.9 CLOUD Act × GDPR Chapter V

- **CLOUD Act (2018):** US authorities can compel **US-based providers** to produce data regardless of storage location. Orders would target your US providers (Google/Firestore, Vercel, AI vendors), not SkillBun directly.
- **GDPR Art. 48:** third-country orders are enforceable only via international agreement (MLAT). EU-side disclosure can't rest on a US order alone.
- **Action:** adopt a law-enforcement request policy — legal review before disclosure, notify users unless prohibited, log, minimize.

### 5.10 Public certificate page — a specific GDPR finding

`/certificate/[id]` displays name + roadmap title to anyone with the link. Analysis:
- Publication of personal data requires a basis. **Consent of the student is cleanest**; a documented legitimate interest with opt-out is defensible given the verification function.
- **Data minimization:** name + roadmap title only, **no email/IP rendered** (verified — `app/certificate/` renders no email field).
- **Add `noindex` / robots exclusion** so pages aren't search-indexed.
- **Add a revocation path** (already partially exists via `is_revoked`).
- Because first-year students are often minors, **consent is the safer basis**.

### 5.11 Processor DPAs

GDPR Art. 28(3) requires written processor terms from: Cloudflare, Google, Zoho, Vercel, Upstash — **and each AI provider**.

> **Pollinations is the weakest link** — a public zero-key tier. Verify its processing terms, or route EU traffic away from it.

---

## 6. Documentation vs Reality — Contradictions Found

These are the places where your published pages disagreed with what the code actually does. **All are now corrected in the updated Privacy Policy**, but the underlying product behaviour should also be reviewed.

| # | Original claim | Actual behaviour | Fixed in |
|---|---|---|---|
| 1 | "We do not integrate tracking pixels or cross-site marketing cookies" | Four analytics systems load on consent (GA4, PostHog, Vercel Analytics, Speed Insights) | Privacy §6 — now discloses all four explicitly |
| 2 | "We only use necessary cookies… session, auth token, theme, quiz state" | 15 storage keys incl. **plaintext name + email** in localStorage, locale cookie, human-proof token, captcha bypass flag | Privacy §2 and §6 — now discloses profile cache and full storage list |
| 3 | AI processing described as "(Groq, OpenRouter, and native engines)" | Six-provider cascade — **TokenRouter, Hugging Face, and Pollinations were undisclosed** | Privacy §5 — all six now named with endpoints |
| 4 | "You can delete your account instantly… permanently deletes your Firebase account authentication record, your Firestore profile document, and all associated roadmap progress" | Self-service path deletes progress + user doc; `quizAttempts` and auth record deletion only provable via the **admin** route; **`/examAttempts` are never deleted by any code path** | Privacy §11 — now scoped honestly, with retention carve-outs stated |
| 5 | "We log queries submitted to BunBot AI, session duration" | **No server-side chat-log storage found** — counsellor history is client-side state | Privacy §2 — over-claim removed |
| 6 | "We do not knowingly collect… from children under the age of 13" | **No age collection or verification exists at all.** And India's child threshold is 18, not 13 | Privacy §12 — now states the Indian/EU/US thresholds honestly |
| 7 | Banner says "aggregated analytics" | `posthog.identify(uid)` + GA `user_id` — **individual-level, not aggregated** | Privacy §6 — now states UID attachment |
| 8 | Undisclosed: IP sent to `api.ipify.org`; watermark shows email + IP; certificate docs store `email` + `uid` in a **publicly readable** collection | Verified in code | Privacy §2, §5, §7, §8 — all now disclosed |
| 9 | "Complete control over your personal data" | `unsubscribes/{email}` survives account deletion | Privacy §11 — scoped honestly |

### Missing mechanisms (product gaps, not text gaps)

1. **No age gate / DOB collection.** ← highest priority
2. No granular per-vendor consent (binary accept/decline only).
3. No user-facing data export (DSAR) mechanism.
4. No retention schedule or TTL job for `examAttempts`, `certificates`, `sentEmailHistory`, `unsubscribes`, or Firestore rate-limit docs.
5. No physical postal address in email footers (CAN-SPAM).
6. No in-product "you are talking to an AI" disclosure (EU AI Act Art. 50 — **live now**).
7. No masking of the public certificate document — `email`/`uid` are needlessly stored in a public-read collection.

---

## 7. Prioritized Action Plan

### 7.1 MUST — live obligations under currently-in-force law

| # | Action | Basis |
|---|---|---|
| M1 | **Stand up a 6-hour CERT-In incident reporting runbook** with a named Point of Contact and tested escalation. | CERT-In Directions, 28 Apr 2022 |
| M2 | **Configure 180-day ICT log retention within Indian jurisdiction** (and build toward the DPDP Rule 6 one-year floor later). | CERT-In Directions; DPDP Rule 6 (2027) |
| M3 | **Complete the Grievance Officer publication** — name ✅, email ✅, **phone and postal address still needed**. | SPDI Rules 2011; DPDP s. 8(10) |
| M4 | **Add a "not a government-recognised degree" disclaimer** to the certificate template and public verification page. *(Terms §6 and Privacy §8 now state it in policy — add it to the certificate UI and PDF too.)* | CPA 2019 |
| M5 | **Substantiate or relabel all outcome claims** — salary ranges need a source and date. *(Terms §8 now frames them as indicative; add visible sourcing on roadmap pages.)* | CPA 2019 s. 2(47) |
| M6 | **Add a valid physical postal address to every commercial-purpose email footer.** | CAN-SPAM (FTC guide) |
| M7 | **Add an in-product "Bun-Bot is an AI assistant" disclosure at the chat interface.** *(Policy text now exists in Terms §2 — the UI element is still missing.)* | EU AI Act Art. 50 — **live since 2 Aug 2026** |
| M8 | **Execute data-processing contracts with every third-party AI provider and Zoho.** | DPDP s. 8(2) |

### 7.2 SHOULD — required by 13 May 2027 (or 1 Jan 2027), needs engineering now

| # | Action | Deadline | Basis |
|---|---|---|---|
| S1 | **Decide and document the children's-data position:** verifiable parental consent for under-18s, OR restrict to 18+, OR seek an age-relaxation notification. Record the analysis. | Before 13 May 2027 | DPDP s. 9(1), 9(5) |
| S2 | **Add a neutral age screen at signup.** | Before 13 May 2027 | DPDP s. 9; COPPA |
| S3 | **Age-segment the retention email engine** so no marketing-style message reaches a known under-18 user. | Before 13 May 2027 | DPDP s. 9(3) |
| S4 | **Rebuild the consent flow** — itemised, plain-language, Eighth-Schedule-capable, with retained proof of consent. | Before 13 May 2027 | DPDP ss. 5, 6, 10 |
| S5 | **Build the four Data Principal rights** including **nomination**, plus withdrawal propagating to processors. | Before 13 May 2027 | DPDP ss. 11–14 |
| S6 | **Build erasure automation** and resolve how erasure interacts with immutable certificates. | Before 13 May 2027 | DPDP s. 8(7)–(8) |
| S7 | **Extend the breach runbook to the Data Protection Board** (users without delay, Board 72h) on the *same* trigger as the 6-hour CERT-In clock. | Before 13 May 2027 | DPDP s. 8(6), Rule 7 |
| S8 | **Appoint an EU and UK representative in writing** and publish them. | GDPR live | GDPR Art. 27 |
| S9 | **Paper every US data flow with SCCs (or DPF) + a transfer impact assessment.** | GDPR live | GDPR Ch. V; Commission adequacy list |
| S10 | **Run and document a DPIA** covering AI processing, proctoring, and minors. | GDPR live | GDPR Art. 35 |
| S11 | **Produce a documented Art. 6 AI Act classification memo.** | Before 2 Dec 2027 (high-risk date) | AI Act Art. 6 |
| S12 | **Colorado ADMT readiness:** point-of-interaction notice, 30-day adverse-decision explanation, human review, access/correction. | **1 Jan 2027** | SB 26-189 |
| S13 | **Add `noindex` to `/certificate/[id]`** and confirm the revocation path. | — | GDPR minimization |
| S14 | **Strip `email` and `uid` from the publicly-readable certificate document** (keep them in a non-public side-collection if needed for admin). | — | GDPR minimization |

### 7.3 NICE-TO-HAVE

| # | Action |
|---|---|
| N1 | WCAG 2.2 AA audit + published accessibility statement (neutralizes EAA ambiguity + ADA Title III). |
| N2 | Publish a cookie/storage notice listing each item and its exemption basis. |
| N3 | Adopt a Consent Manager once registration opens (13 Nov 2026). |
| N4 | Pre-write a Significant Data Fiduciary readiness pack (annual DPIA, audit, algorithmic due diligence). |
| N5 | Publish a refund/cancellation policy ahead of the first payment. |
| N6 | Adopt a law-enforcement request policy (CLOUD Act / Art. 48). |
| N7 | Vendor DPA register with review dates; confirm AI vendors don't train on your prompts. |
| N8 | Resolve the CC BY-NC-ND vs SBV1-encryption licensing question in a written statement. |

---

## 8. What Was Changed in This Review

Two files were updated — **content only, no layout, component, theme, or structural changes**:

| File | Change |
|---|---|
| `app/privacy/page.jsx` | Expanded from 10 to 15 sections. Added: named Data Fiduciary + Grievance Officer (DPDP s. 8(9), SPDI Rules); proctoring/IP disclosure; public certificate disclosure; full AI provider cascade (6 providers named); honest analytics disclosure (all 4 systems + UID attachment); legal bases section; retention section; international transfers; expanded rights incl. nomination; corrected children's section stating the Indian 18 / EU 13–16 / US 13 thresholds; CERT-In + DPDP breach-notification statement; cookie/storage accuracy. |
| `app/terms/page.jsx` | Expanded from 10 to 13 sections. Added: AI disclosure (EU AI Act Art. 50 support); eligibility & age clause (under-18 parental consent, under-13 prohibited); certificate scope disclaimers (not a degree, revocable, publicly verifiable); salary claims framed as indicative benchmarks; mandatory consumer-law carve-out; grievance redressal section; cross-link to Privacy Policy. |

**Preserved:** the `static-page` CSS class and layout system, `PrivacyPreferences` component placement, all `metadata`/OpenGraph structure, the existing tone, and the India/New Delhi governing law clause.

---

## 9. Explicitly Unverified Items

Do not treat these as settled. Each should be confirmed against primary sources:

1. **DPDP Rules 2025 Fourth Schedule verbatim text** — the exemption's scope for educational institutions. **Highest-value verification**, because it determines whether any children's-data relief exists.
2. **IT Amendment Rules 2026 full text** — the SGI/deepfake labelling duties and 3-hour takedown window are search-snippet level only. **Second-highest value**, because Bun-Bot generates synthetic content.
3. **CERT-In 180-day log retention figure**, Point-of-Contact, and NTP requirements — the 6-hour rule is verified; the rest is training knowledge. The `cert-in.org.in` PDF fetch failed.
4. **SPDI Rules 2011 rule-by-rule text** — only the "still in force" status was verified.
5. **E-Commerce Rules 2020 text and any 2025/2026 amendment.**
6. **Copyright Act 1957** reasoning — no source fetched.
7. **UGC/AICTE** positioning and the CCPA 2022 Misleading Advertisements Guidelines — no sources fetched.
8. **EU AI Act omnibus (Reg 2026/1744) operative dates** — conflict between secondary sources (2 Dec 2027) and the FLI timeline (2027); only recitals were read. **Art. 50 did not move** — corroborated by multiple sources.
9. **ICO registration fee applicability** to a non-UK-established controller — three ICO subpage fetches failed.
10. **UK adequacy for India** — not verified.
11. **European Accessibility Act** application date and scope.
12. **US state AI disclosure laws** (CA SB 942, Utah, Texas TRAIGA) — not verified.
13. **Cloudflare Turnstile's** own cookie/privacy classification.
14. **Remainder of `deleteAccount` past `AuthProvider.jsx:466`** — whether it deletes the Firebase Auth record and `quizAttempts`; and whether `vercel.json` / `firebase.json` / `firebase-functions/` contain cron or region configuration. *(Repo-level, quickly checkable.)*

---

## 10. Appendix — Certificate `email` Field Remediation Analysis (29 Sep 2026)

**Question posed by review:** `/certificates/{certId}` is publicly readable (`allow get: if true`, `firestore.rules`) and stores `email` + `uid`. Should the `email` field be dropped server-side?

**Answer after full repo-wide dependency analysis: NOT as a standalone change.** The field is load-bearing in at least four server paths.

### 10.1 Verified dependency map (file:line evidence)

| Consumer | Fields relied on | Breaks without `email`? |
|---|---|---|
| `app/api/admin/users/[uid]/route.js:91–95` — cascade certificate deletion `where('email','==',…)` | email | **Yes — certificates linger after account deletion** |
| `app/api/admin/workforce/employees/[id]/route.js:145–146` — workforce cascade deletion by email | email | **Yes** |
| `app/api/alumni/documents/route.js:215` — alumni email search `where('email','==',searchQuery)` | email | **Yes — a `where` on a missing field matches nothing; the alumni UI (`app/alumni/page.jsx:119–129`) actively advertises this search** |
| `app/api/alumni/documents/route.js:118,190–195,222–232` — ownership recognition (`userEmail === certEmail`) and owner-vs-masked email display | email | **Yes — owner never recognized; every result degrades to masked/empty** |
| `app/api/admin/analytics/route.js:246–247` — orphan detection `(c.uid && uids.has) || (c.email && emails.has)`; `:282` cert↔user link | email + uid | **Yes — every admin/termination-issued cert (which carries NO `uid`) would be misclassified as orphaned** |
| `app/api/admin/certificates/route.js:93,~136–142,:250` — admin list, search, mint write | email | Yes (admin surface) |
| `app/api/admin/certificates/[id]/route.js:111` — PATCH email rewrite | email | Yes (API-level) |
| `app/api/admin/workforce/credentials/route.js:48` — credentials list display | email | Yes (display) |
| `app/dashboard/console/admin/certificates/page.jsx:403,826–827,568` — console search, render, mint payload | email | Yes (admin UI) |
| `firestore.rules:111` — owner listing `signedInAs(resource.data.uid)` | **uid** | `uid` is equally load-bearing — do not remove it either |
| `utils/server/certifyEngine.js:137–141`, `utils/server/emailStudentContext.js:12`, `app/dashboard/certifications/CertificationsClient.jsx:71–75`, `app/roadmap/[slug]/certify/page.jsx:337–341` | uid | uid-based queries — unaffected by email removal, but confirm `uid` stays |
| `app/certificate/[id]/page.jsx` + `app/certificate/page.jsx` — **public verifier** | none | ✅ **No email references at all** — the public page never reads the field |
| `tests/unit/verifiedEmail.test.mjs:87` | pins `allow get: if true` | Any rules change breaks this test |
| `tests/unit/productionHardening.test.mjs:39,78–79` | asserts only `name`/`roadmapTitle` | ⚠️ **Coverage gap: no test asserts `email` presence — a standalone removal would pass CI and fail only in production** |

> **Important correction to the earlier review note:** `app/api/admin/analytics/route.js` does **not** purge orphaned certificates. Lines 241–243 state explicitly that it is a read path which *"must never mutate data"*, and orphaned records are reported only as a diagnostic count (`:250, :286`). The risk there is a **miscounted statistic**, not data loss.

### 10.2 Critical structural fact

Two of four issuance paths write **no `uid`** — admin POST (`app/api/admin/certificates/route.js:250`) and termination issuance (`app/api/admin/workforce/terminate/route.js:91/115/139`). For those records, **`email` is the only linkage key to any human**. This is why `email` removal cascades so widely.

### 10.3 Remediation options, ranked safest-first

| Option | What | Regression risk | Effort |
|---|---|---|---|
| **(c′) RECOMMENDED — sanitized public API** | Keep the stored document untouched. Lock `get` to admin/owner in `firestore.rules` (mirroring the `list` rule) and serve public verification through a new server endpoint returning only display fields (`name, roadmapTitle, display_id, cert_type, stream_or_track, designation, createdAt, is_revoked`). Rewire `app/certificate/[id]/page.jsx` and `app/certificate/page.jsx`. Update `verifiedEmail.test.mjs:87`. | Low–moderate. Every server consumer of `email` keeps working; no data migration. Note: Firestore rules cannot do field-level projection — `allow get` is all-or-nothing — so a rules-only tweak cannot "return part of the document"; the API endpoint is the correct realization. | Medium |
| **(b) Field migration** | Public doc keeps display fields only; a private record holds linkage keys. Rewire all consumers in §10.1 + migrate existing records. | Moderate–high — the consumer list is complete but any miss silently degrades. | High |
| **(a) Drop `email` from mint payloads** | Smallest diff but **unsafe alone**: triggers alumni-search failure, ownership-masking failure, and orphan-misclassification of all uid-less certs. Only viable after (b)-level rewiring + migration. Also **would pass CI** (no test covers `email`) — which is exactly the trap. | High | Low diff, high blast radius |
| **(d) Leave as-is** | Zero functional risk. Residual exposure: anyone holding a cert ID can read the full document via the public API (ID entropy ≈ 60 bits — enumeration impractical, but shared links leak the embedded email). | None | None |

**Sensible first step for any path:** write `uid` on the two uid-less issuance paths (or backfill from `employees.user_uid`) — this neutralizes the most dangerous dependency and shrinks every subsequent change.

**Decision needed from product owner** — this touches the certificate data model, cascade deletion, and alumni search (all sensitive areas under AGENTS.md). Await explicit direction before implementing.

---

## 11. Bottom Line

**Where you stand:**

- **Strong on security engineering.** Firestore rules, SBV1 encryption, server-authoritative certification, consent-gated analytics, and email suppression are all genuinely well-built. That is real, and it is the hardest part.
- **Weak on minors.** This is the one finding that could genuinely hurt you, and it is a product design problem, not a wording problem.
- **Already-live gaps you can close cheaply:** CERT-In runbook, postal address in emails, AI disclosure in the chat UI, "not a degree" disclaimer on certificates, DPAs with AI providers.
- **The big clock is 13 May 2027** for DPDP, with **1 Jan 2027** for Colorado and **2 Dec 2026** for AI Act Art. 50(2) synthetic-content marking as nearer milestones.

**The strategic posture:** you already behave conservatively in code — consent-gated analytics and email suppression prove that instinct. The gap is that the *policy documents and the age/consent surface* had not caught up to what the code actually does. Both pages are now accurate. The remaining work is engineering and process, not writing.

**One recommendation above all others:** decide the under-18 question before you scale. Everything else on this list is a task; that one is a fork in the road.
